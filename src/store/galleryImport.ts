import type { PluginListenerHandle } from "@capacitor/core";
import type { CameraProgress } from "./cameraFlow";
export type ImportReference = {
  id: string;
  name: string;
  mime: string;
  size: number;
};
export type ImportBatch = {
  files: ImportReference[];
  cancelled?: boolean;
  error: string;
};
export type GalleryOptions = {
  signal?: AbortSignal;
  onProgress?: (state: CameraProgress) => void;
};
export interface GalleryBridge {
  pickImages(options: { max: number; requestId: string }): Promise<ImportBatch>;
  cancelPickImages(options: { requestId: string }): Promise<void>;
  release(options: { id: string }): Promise<void>;
  addListener(
    event: "importProgress",
    listener: (event: {
      requestId: string;
      phase: string;
      bytes: number;
      files: number;
    }) => void,
  ): Promise<PluginListenerHandle>;
}
export function abortCheck(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Operation cancelled", "AbortError");
}
export function abortable<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("Operation cancelled", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
    if (signal.aborted) cancel();
  });
}
/** Adapter dependencies are internal typed composition; product always supplies native transport. */
export function createGalleryImporter(
  bridge: GalleryBridge,
  read: (file: ImportReference, options: GalleryOptions) => Promise<Uint8Array>,
  requestId: () => string = () => crypto.randomUUID(),
) {
  return async (max: number, options: GalleryOptions = {}): Promise<File[]> => {
    abortCheck(options.signal);
    const id = requestId();
    let listener: PluginListenerHandle | undefined,
      batch: ImportBatch | undefined;
    let aborted = false;
    let abortReject: ((error: unknown) => void) | undefined;
    const release = (files: ImportReference[]) =>
      Promise.allSettled(files.map((file) => bridge.release({ id: file.id })));
    const abort = () => {
      aborted = true;
      void bridge.cancelPickImages({ requestId: id }).catch(() => {});
      abortReject?.(new DOMException("Operation cancelled", "AbortError"));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      options.onProgress?.({ phase: "selecting", bytes: 0, files: 0 });
      try {
        listener = await bridge.addListener("importProgress", (event) => {
          if (
            aborted ||
            event.requestId !== id ||
            !["selecting", "importing", "reading"].includes(event.phase) ||
            !Number.isFinite(event.bytes) ||
            event.bytes < 0 ||
            event.bytes > 128 * 1024 * 1024 ||
            !Number.isInteger(event.files) ||
            event.files < 0 ||
            event.files > 200
          )
            return;
          options.onProgress?.({
            phase: event.phase as CameraProgress["phase"],
            bytes: event.bytes,
            files: event.files,
          });
        });
      } catch {
        /* Older native transport still reports phase transitions at promise boundaries. */
      }
      abortCheck(options.signal);
      const pending = bridge.pickImages({
        max: Math.max(1, Math.min(200, Math.floor(max) || 1)),
        requestId: id,
      });
      // Native cancellation owns resources. A genuinely late older bridge response is released here.
      void pending
        .then((result) => {
          if (aborted && !batch) void release(result.files ?? []);
        })
        .catch(() => {});
      batch = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          abortReject = reject;
          if (aborted)
            reject(new DOMException("Operation cancelled", "AbortError"));
        }),
      ]);
      abortCheck(options.signal);
      if (batch.error) throw new Error(batch.error);
      if (batch.cancelled) return [];
      if (
        !Array.isArray(batch.files) ||
        batch.files.length > Math.max(1, Math.min(200, max)) ||
        batch.files.some(
          (file) => !Number.isSafeInteger(file.size) || file.size <= 0,
        ) ||
        batch.files.reduce((n, f) => n + f.size, 0) > 128 * 1024 * 1024
      )
        throw new Error(
          "Choose readable photos within the page limit and 128 MB batch limit.",
        );
      const files: File[] = [];
      for (const reference of batch.files) {
        abortCheck(options.signal);
        options.onProgress?.({
          phase: "reading",
          files: files.length,
          bytes: 0,
        });
        const bytes = await abortable(read(reference, options), options.signal);
        abortCheck(options.signal);
        files.push(
          new File([bytes.slice().buffer], reference.name, {
            type: reference.mime || "image/jpeg",
          }),
        );
      }
      return files;
    } finally {
      options.signal?.removeEventListener("abort", abort);
      const cleanup = async () => {
        await listener?.remove().catch(() => {});
        if (batch) await release(batch.files ?? []);
      };
      // An unavailable/older bridge must not keep the caller pending merely for cleanup.
      // Native resources remain session-owned; best-effort old-bridge cleanup is not certified.
      if (aborted || options.signal?.aborted) void cleanup().catch(() => {});
      else await cleanup();
    }
  };
}
