import type { PickedFile } from '../lib/types';

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

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
  return 'application/octet-stream';
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

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): void {
  downloadBlob(new Blob([toArrayBuffer(bytes)], { type: mime }), filename);
}

export async function shareOrDownload(
  bytes: Uint8Array,
  filename: string,
  mime = 'application/pdf',
): Promise<void> {
  const file = new File([toArrayBuffer(bytes)], filename, { type: mime });
  const payload = { files: [file], title: filename };
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare(payload)) {
      await navigator.share(payload);
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
  }
  downloadBytes(bytes, filename, mime);
}

export async function shareOrDownloadBlobs(
  blobs: Blob[],
  basename: string,
): Promise<void> {
  const files = blobs.map((blob, index) => {
    const type = blob.type || 'image/jpeg';
    const ext = type.includes('png') ? 'png' : 'jpg';
    return new File([blob], `${basename}-${String(index + 1).padStart(2, '0')}.${ext}`, {
      type,
    });
  });
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
      await navigator.share({ files, title: basename });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
  }
  for (const file of files) downloadBlob(file, file.name);
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
