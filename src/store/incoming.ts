import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { PickedFile } from "../lib/types";
import { ensureJpegOrPng, MAX_INPUT_BYTES, toArrayBuffer } from "./files";
type Incoming = { id: string; name: string; mime: string; size: number };
const importer = registerPlugin<{
  takeFiles(): Promise<{ files: Incoming[]; error: string }>;
  pickImages(options: {
    max: number;
  }): Promise<{ files: Incoming[]; cancelled?: boolean; error: string }>;
  readChunk(options: { id: string; offset: number }): Promise<{ data: string }>;
  release(options: { id: string }): Promise<void>;
  addListener(
    event: "incoming",
    callback: (event?: {openingPdf?:boolean}) => void,
  ): Promise<PluginListenerHandle>;
}>("FileImporter");

function isUnimplementedPluginError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not implemented|unimplemented|is not available/i.test(message);
}

async function readIncomingBytes(file: Incoming): Promise<Uint8Array> {
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  while (offset < bytes.length) {
    const { data } = await importer.readChunk({
      id: file.id,
      offset,
    });
    const binary = atob(data);
    if (!binary.length || offset + binary.length > bytes.length)
      throw new Error("The file could not be read completely.");
    for (let i = 0; i < binary.length; i++)
      bytes[offset + i] = binary.charCodeAt(i);
    offset += binary.length;
  }
  return bytes;
}

/** Keep native still-photo bytes intact; no gallery downsampling or re-encoding. */
export async function readNativeCameraPhoto(file: Incoming): Promise<PickedFile> {
  try {
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_INPUT_BYTES)
      throw new Error('The captured photo exceeds 128 MB or is unavailable.');
    return { name: file.name, mime: file.mime, bytes: await readIncomingBytes(file) };
  } finally { await importer.release({ id: file.id }).catch(() => undefined); }
}

export function androidGalleryPickerAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function fileArrayToFileList(files: File[]): FileList {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}

/** Native Android photo picker. `null` means fall back to `<input type="file">`. */
export async function pickGalleryImages(max: number): Promise<File[] | null> {
  if (!androidGalleryPickerAvailable()) return null;
  const limit = Math.max(1, Math.min(200, Math.floor(max) || 1));
  let batch: { files: Incoming[]; cancelled?: boolean; error: string };
  try {
    batch = await importer.pickImages({ max: limit });
  } catch (error) {
    if (isUnimplementedPluginError(error)) return null;
    throw error instanceof Error
      ? error
      : new Error("Could not open the gallery.");
  }
  if (batch.error) throw new Error(batch.error);
  if (batch.cancelled || batch.files.length === 0) return [];
  try {
    if (batch.files.reduce((sum, file) => sum + file.size, 0) > MAX_INPUT_BYTES)
      throw new Error("Those photos exceed 128 MB. Choose a smaller group.");
    const files: File[] = [];
    for (const file of batch.files) {
      const bytes = await readIncomingBytes(file);
      files.push(
        new File([toArrayBuffer(bytes)], file.name, {
          type: file.mime || "image/jpeg",
        }),
      );
    }
    return files;
  } finally {
    await Promise.allSettled(
      batch.files.map((file) => importer.release({ id: file.id })),
    );
  }
}
export function subscribeIncoming(
  onFiles: (files: PickedFile[]) => void,
  onError: (message: string) => void,
  onOpeningPdf?: () => void,
): () => void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android")
    return () => {};
  let active = true,
    draining = false,
    again = false;
  let listener: PluginListenerHandle | undefined;
  async function drain() {
    if (draining) {
      again = true;
      return;
    }
    draining = true;
    try {
      do {
        again = false;
        const batch = await importer.takeFiles();
        try {
          if (batch.error) onError(batch.error);
          if (
            batch.files.reduce((sum, file) => sum + file.size, 0) >
            MAX_INPUT_BYTES
          )
            throw new Error("Shared files exceed 128 MB.");
          const files: PickedFile[] = [];
          if(active && batch.files.length===1 && (batch.files[0]!.mime==='application/pdf' || batch.files[0]!.name.toLowerCase().endsWith('.pdf'))) onOpeningPdf?.();
          for (const file of batch.files) {
            if (!active) break;
            const bytes = await readIncomingBytes(file);
            const picked = { name: file.name, mime: file.mime, bytes };
            files.push(
              file.mime.startsWith("image/")
                ? await ensureJpegOrPng(picked)
                : picked,
            );
          }
          if (active && files.length) onFiles(files);
        } finally {
          await Promise.allSettled(
            batch.files.map((file) => importer.release({ id: file.id })),
          );
        }
      } while (again && active);
    } catch (error) {
      if (active)
        onError(
          error instanceof Error
            ? error.message
            : "Could not receive shared files.",
        );
    } finally {
      draining = false;
    }
  }
  void importer
    .addListener("incoming", event => {
      if(active && event?.openingPdf) onOpeningPdf?.();
      void drain();
    })
    .then((handle) => {
      listener = handle;
      if (!active) void handle.remove();
      else void drain();
    })
    .catch(() => {
      if (active) onError("Could not initialize shared-file import.");
    });
  return () => {
    active = false;
    void listener?.remove();
  };
}
