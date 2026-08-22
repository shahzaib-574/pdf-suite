import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { PickedFile } from '../lib/types';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ZIP_MIME = 'application/zip';
const NATIVE_EXPORT_ROOT = 'ream-exports';
// Keep each base64 bridge payload bounded and aligned to three bytes for appendFile.
const NATIVE_WRITE_CHUNK_BYTES = 192 * 1024;
const BINARY_STRING_CHUNK_BYTES = 32 * 1024;
const STAGED_EXPORT_MAX_AGE_MS = 60 * 60 * 1000;
const IMAGE_ARCHIVE_MAX_FILES = 40;
const IMAGE_ARCHIVE_MAX_INPUT_BYTES = 32 * 1024 * 1024;

type FileExporterOptions = {
  sourcePath: string;
  filename: string;
  mimeType: string;
};

type FileExporterResult = {
  cancelled: boolean;
  uri?: string;
};

interface FileExporterPlugin {
  saveFile(options: FileExporterOptions): Promise<FileExporterResult>;
}

const FileExporter = registerPlugin<FileExporterPlugin>('FileExporter');

export type ExportResult =
  | { status: 'completed' }
  | { status: 'cancelled' };

const COMPLETED: ExportResult = { status: 'completed' };
const CANCELLED: ExportResult = { status: 'cancelled' };

type NamedBlob = {
  blob: Blob;
  filename: string;
  mime: string;
};

type StagedNativeFile = {
  path: string;
  uri: string;
  filename: string;
  mime: string;
};

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${Math.round(size)} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function mimeFromFilename(filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx')) return DOCX_MIME;
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.zip')) return ZIP_MIME;
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.avif')) return 'image/avif';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.bmp')) return 'image/bmp';
  if (name.endsWith('.tif') || name.endsWith('.tiff')) return 'image/tiff';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function normalizedMime(filename: string, mime?: string): string {
  const supplied = mime?.trim().toLowerCase();
  if (supplied === 'image/jpg') return 'image/jpeg';
  if (supplied === 'application/x-zip-compressed') return ZIP_MIME;
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  return mimeFromFilename(filename);
}

function mimeOf(file: File): string {
  return normalizedMime(file.name, file.type);
}

function extensionForMime(mime: string): string {
  const extensions: Record<string, string> = {
    'application/pdf': 'pdf',
    [DOCX_MIME]: 'docx',
    'application/msword': 'doc',
    [ZIP_MIME]: 'zip',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/svg+xml': 'svg',
    'text/plain': 'txt',
  };
  return extensions[normalizedMime('', mime)] ?? 'bin';
}

function sanitizedFilename(filename: string, fallback = 'export'): string {
  const leaf = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .normalize('NFKC')
    .replace(/\p{Cc}+/gu, '_')
    .replace(/\p{Cf}+/gu, '_')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  const safe = cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
  if (safe.length <= 120) return safe;
  const extensionAt = safe.lastIndexOf('.');
  if (extensionAt <= 0 || extensionAt < safe.length - 16) return safe.slice(0, 120);
  const extension = safe.slice(extensionAt);
  return `${safe.slice(0, Math.max(1, 120 - extension.length))}${extension}`;
}

function filenameStem(filename: string, fallback: string): string {
  const safe = sanitizedFilename(filename, fallback);
  return safe.replace(/\.[^.]+$/, '') || fallback;
}

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function isSafeExportId(exportId: string): boolean {
  return /^[a-z0-9-]+$/i.test(exportId);
}

async function removeStagedNativeExport(exportId: string): Promise<void> {
  if (!isAndroidNative() || !isSafeExportId(exportId)) return;
  try {
    await Filesystem.rmdir({
      path: `${NATIVE_EXPORT_ROOT}/${exportId}`,
      directory: Directory.Cache,
      recursive: true,
    });
  } catch {
    // The native bridge or OS may already have removed this cache directory.
  }
}

function scheduleStagedNativeExportCleanup(exportId: string): void {
  window.setTimeout(() => {
    void removeStagedNativeExport(exportId);
  }, STAGED_EXPORT_MAX_AGE_MS);
}

export async function pruneStagedNativeExports(): Promise<void> {
  if (!isAndroidNative()) return;
  try {
    const { files } = await Filesystem.readdir({
      path: NATIVE_EXPORT_ROOT,
      directory: Directory.Cache,
    });
    const cutoff = Date.now() - STAGED_EXPORT_MAX_AGE_MS;
    await Promise.allSettled(
      files
        .filter(
          (entry) =>
            entry.type === 'directory' &&
            Number.isFinite(entry.mtime) &&
            entry.mtime < cutoff &&
            isSafeExportId(entry.name),
        )
        .map((entry) =>
          Filesystem.rmdir({
            path: `${NATIVE_EXPORT_ROOT}/${entry.name}`,
            directory: Directory.Cache,
            recursive: true,
          }),
        ),
    );
  } catch {
    // The export cache does not exist yet, or the OS has already cleared it.
  }
}

function newExportId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += BINARY_STRING_CHUNK_BYTES) {
    const chunk = bytes.subarray(
      offset,
      Math.min(bytes.byteLength, offset + BINARY_STRING_CHUNK_BYTES),
    );
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function stageNativeBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  exportId: string,
): Promise<StagedNativeFile> {
  const safeFilename = sanitizedFilename(filename);
  const path = `${NATIVE_EXPORT_ROOT}/${exportId}/${safeFilename}`;
  try {
    const first = bytes.subarray(0, Math.min(bytes.byteLength, NATIVE_WRITE_CHUNK_BYTES));
    await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: bytesToBase64(first),
      recursive: true,
    });
    for (let offset = first.byteLength; offset < bytes.byteLength; offset += NATIVE_WRITE_CHUNK_BYTES) {
      const chunk = bytes.subarray(
        offset,
        Math.min(bytes.byteLength, offset + NATIVE_WRITE_CHUNK_BYTES),
      );
      await Filesystem.appendFile({
        path,
        directory: Directory.Cache,
        data: bytesToBase64(chunk),
      });
    }
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    return {
      path,
      uri,
      filename: safeFilename,
      mime: normalizedMime(safeFilename, mime),
    };
  } catch (error) {
    await removeStagedNativeExport(exportId);
    throw error;
  }
}

function isShareCancellation(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: unknown };
  const message = typeof value.message === 'string' ? value.message : '';
  // @capacitor/share 8.0.1 rejects Android chooser cancellation with this exact text.
  return message.trim() === 'Share canceled';
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizedFilename(filename);
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function hasJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** pdf-lib only embeds JPEG/PNG. Rasterize camera WebP/HEIC on this device. */
export async function ensureJpegOrPng(file: PickedFile): Promise<PickedFile> {
  if (hasJpegMagic(file.bytes) || hasPngMagic(file.bytes)) return file;
  const blob = new Blob([toArrayBuffer(file.bytes)], {
    type: file.mime || 'image/*',
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, bitmap.width);
  canvas.height = Math.max(1, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not convert this image on-device.');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => {
        if (!out) reject(new Error('Could not encode this image as JPEG.'));
        else resolve(out);
      },
      'image/jpeg',
      0.92,
    );
  });
  canvas.width = 0;
  canvas.height = 0;
  const stem = file.name.replace(/\.[^.]+$/, '') || 'image';
  return {
    name: `${stem}.jpg`,
    mime: 'image/jpeg',
    bytes: new Uint8Array(await jpeg.arrayBuffer()),
  };
}

export async function fileListToPicked(
  files: FileList | File[],
  asPdfImages = false,
): Promise<PickedFile[]> {
  const list = Array.from(files);
  const picked = await Promise.all(
    list.map(async (file) => ({
      name: file.name,
      mime: mimeOf(file),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
  if (!asPdfImages) return picked;
  return Promise.all(picked.map((file) => ensureJpegOrPng(file)));
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  mime = blob.type,
): Promise<ExportResult> {
  return saveBytes(
    new Uint8Array(await blob.arrayBuffer()),
    filename,
    normalizedMime(filename, mime),
  );
}

export async function saveBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): Promise<ExportResult> {
  const safeFilename = sanitizedFilename(filename);
  const safeMime = normalizedMime(safeFilename, mime);
  if (!isAndroidNative()) {
    triggerBrowserDownload(
      new Blob([toArrayBuffer(bytes)], { type: safeMime }),
      safeFilename,
    );
    return COMPLETED;
  }

  await pruneStagedNativeExports();
  const exportId = newExportId();
  try {
    const staged = await stageNativeBytes(bytes, safeFilename, safeMime, exportId);
    const result = await FileExporter.saveFile({
      sourcePath: staged.path,
      filename: staged.filename,
      mimeType: staged.mime,
    });
    return result.cancelled ? CANCELLED : COMPLETED;
  } finally {
    await removeStagedNativeExport(exportId);
  }
}

function namedImageBlobs(blobs: Blob[], basename: string): NamedBlob[] {
  const stem = filenameStem(basename, 'page');
  return blobs.map((blob, index) => {
    const mime = normalizedMime('', blob.type || 'image/jpeg');
    const extension = extensionForMime(mime);
    return {
      blob,
      filename: sanitizedFilename(
        `${stem}-${String(index + 1).padStart(2, '0')}.${extension}`,
      ),
      mime,
    };
  });
}

async function imageArchiveBytes(files: NamedBlob[]): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, new Uint8Array(await file.blob.arrayBuffer()));
  }
  return zip.generateAsync({
    type: 'uint8array',
    // Exported page images are already compressed, so STORE avoids needless CPU work.
    compression: 'STORE',
  });
}

function assertImageArchiveWithinLimits(blobs: Blob[]): void {
  if (blobs.length <= 1) return;
  if (blobs.length > IMAGE_ARCHIVE_MAX_FILES) {
    throw new Error(
      `Ream can bundle up to ${IMAGE_ARCHIVE_MAX_FILES} images at once. ` +
        'Use Split PDF first, then export each smaller part.',
    );
  }
  const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  if (totalBytes > IMAGE_ARCHIVE_MAX_INPUT_BYTES) {
    throw new Error(
      `These images total ${formatBytes(totalBytes)}, which is too large to bundle reliably. ` +
        'Use Split PDF first, then export each smaller part.',
    );
  }
}

export async function saveImageBlobs(
  blobs: Blob[],
  basename: string,
): Promise<ExportResult> {
  if (blobs.length === 0) throw new Error('There are no images to save.');
  assertImageArchiveWithinLimits(blobs);
  const files = namedImageBlobs(blobs, basename);
  const first = files[0]!;
  if (files.length === 1) return saveBlob(first.blob, first.filename, first.mime);
  const archiveName = `${filenameStem(basename, 'pages')}.zip`;
  return saveBytes(await imageArchiveBytes(files), archiveName, ZIP_MIME);
}

export async function shareOrDownload(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): Promise<ExportResult> {
  const safeFilename = sanitizedFilename(filename);
  const safeMime = normalizedMime(safeFilename, mime);
  if (isAndroidNative()) {
    await pruneStagedNativeExports();
    const exportId = newExportId();
    try {
      const staged = await stageNativeBytes(bytes, safeFilename, safeMime, exportId);
      await Share.share({
        title: staged.filename,
        dialogTitle: `Share ${staged.filename}`,
        files: [staged.uri],
      });
      scheduleStagedNativeExportCleanup(exportId);
      return COMPLETED;
    } catch (error) {
      await removeStagedNativeExport(exportId);
      if (isShareCancellation(error)) return CANCELLED;
      throw error;
    }
  }

  const file = new File([toArrayBuffer(bytes)], safeFilename, { type: safeMime });
  const payload = { files: [file], title: safeFilename };
  try {
    if (
      typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(payload))
    ) {
      await navigator.share(payload);
      return COMPLETED;
    }
  } catch (error) {
    if (isShareCancellation(error)) return CANCELLED;
  }
  triggerBrowserDownload(file, safeFilename);
  return COMPLETED;
}

export async function shareOrDownloadBlobs(
  blobs: Blob[],
  basename: string,
): Promise<ExportResult> {
  if (blobs.length === 0) throw new Error('There are no images to share.');
  const files = namedImageBlobs(blobs, basename);
  if (isAndroidNative()) {
    await pruneStagedNativeExports();
    const exportId = newExportId();
    const staged: StagedNativeFile[] = [];
    try {
      for (const file of files) {
        staged.push(
          await stageNativeBytes(
            new Uint8Array(await file.blob.arrayBuffer()),
            file.filename,
            file.mime,
            exportId,
          ),
        );
      }
      await Share.share({
        title: filenameStem(basename, 'pages'),
        dialogTitle: 'Share images',
        files: staged.map((file) => file.uri),
      });
      scheduleStagedNativeExportCleanup(exportId);
      return COMPLETED;
    } catch (error) {
      await removeStagedNativeExport(exportId);
      if (isShareCancellation(error)) return CANCELLED;
      throw error;
    }
  }

  const browserFiles = files.map(
    (file) => new File([file.blob], file.filename, { type: file.mime }),
  );
  const payload = { files: browserFiles, title: filenameStem(basename, 'pages') };
  try {
    if (
      typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(payload))
    ) {
      await navigator.share(payload);
      return COMPLETED;
    }
  } catch (error) {
    if (isShareCancellation(error)) return CANCELLED;
  }
  return saveImageBlobs(blobs, basename);
}

/** @deprecated Prefer saveBlob; retained for callers outside the React screens. */
export async function downloadBlob(blob: Blob, filename: string): Promise<ExportResult> {
  return saveBlob(blob, filename, blob.type);
}

/** @deprecated Prefer saveBytes; retained for callers outside the React screens. */
export async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): Promise<ExportResult> {
  return saveBytes(bytes, filename, mime);
}

export function pickCamera(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => {
      resolve(input.files ? Array.from(input.files) : []);
    };
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
