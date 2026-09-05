import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type { PickedFile } from "../lib/types";
import { ensureJpegOrPng, MAX_INPUT_BYTES } from "./files";
type Incoming = { id: string; name: string; mime: string; size: number };
const importer = registerPlugin<{
  takeFiles(): Promise<{ files: Incoming[]; error: string }>;
  readChunk(options: { id: string; offset: number }): Promise<{ data: string }>;
  release(options: { id: string }): Promise<void>;
  addListener(
    event: "incoming",
    callback: () => void,
  ): Promise<PluginListenerHandle>;
}>("FileImporter");
export function subscribeIncoming(
  onFiles: (files: PickedFile[]) => void,
  onError: (message: string) => void,
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
          for (const file of batch.files) {
            if (!active) break;
            const bytes = new Uint8Array(file.size);
            let offset = 0;
            while (offset < bytes.length) {
              const { data } = await importer.readChunk({
                id: file.id,
                offset,
              });
              const binary = atob(data);
              if (!binary.length || offset + binary.length > bytes.length)
                throw new Error(
                  "The shared file could not be read completely.",
                );
              for (let i = 0; i < binary.length; i++)
                bytes[offset + i] = binary.charCodeAt(i);
              offset += binary.length;
            }
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
    .addListener("incoming", () => {
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
