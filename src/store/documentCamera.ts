import { Capacitor, registerPlugin } from "@capacitor/core";
import { validCorners, type Point } from "../pdf/scanGeometry";
import type { PickedFile } from "../lib/types";
import { abortCheck, abortable } from "./galleryImport";
export type Capture = {
  cancelled?: boolean;
  gallery?: boolean;
  id: string;
  name: string;
  mime: string;
  size: number;
  corners?: Point[];
};
export interface DocumentCameraBridge {
  capture(options: { requestId: string }): Promise<Capture>;
  cancelCapture(options: { requestId: string }): Promise<void>;
}
const camera = registerPlugin<DocumentCameraBridge>("DocumentCamera");
export function nativeDocumentCameraAvailable(): boolean {
  return (
    Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("DocumentCamera")
  );
}
/** Shared underlying operation survives StrictMode replay; cancellation is lease-owned, not instance-global. */
export function createDocumentCapture(
  bridge: DocumentCameraBridge,
  read: (capture: Capture, signal: AbortSignal) => Promise<PickedFile>,
  requestId: () => string = () => crypto.randomUUID(),
) {
  type Shared = {
    id: string;
    abort: AbortController;
    leases: Set<object>;
    promise: Promise<PickedFile | "gallery" | null>;
  };
  let pending: Shared | undefined;
  const acquire = (
    options: { signal?: AbortSignal } = {},
  ): Promise<PickedFile | "gallery" | null> => {
    abortCheck(options.signal);
    if (pending?.abort.signal.aborted) {
      // A true unmount is not StrictMode replay: wait for old native ownership to retire.
      return abortable(
        pending.promise.catch(() => undefined),
        options.signal,
      ).then(() => acquire(options));
    }
    if (!pending) {
      const shared = {
        id: requestId(),
        abort: new AbortController(),
        leases: new Set<object>(),
        promise: undefined as unknown as Shared["promise"],
      };
      pending = shared;
      shared.promise = (async () => {
        const capture = await bridge.capture({ requestId: shared.id });
        if (capture.gallery || capture.cancelled)
          abortCheck(shared.abort.signal);
        if (capture.gallery) return "gallery" as const;
        if (capture.cancelled) return null;
        // Even an obsolete response must release its private photo through read's finally path.
        const file = await abortable(
          read(capture, shared.abort.signal),
          shared.abort.signal,
        );
        abortCheck(shared.abort.signal);
        return {
          ...file,
          scanCorners:
            capture.corners && validCorners(capture.corners)
              ? capture.corners
              : undefined,
        };
      })().finally(() => {
        if (pending === shared) pending = undefined;
      });
    }
    const shared = pending,
      lease = {};
    shared.leases.add(lease);
    return new Promise((resolve, reject) => {
      let settled = false;
      const detach = () => {
        shared.leases.delete(lease);
        options.signal?.removeEventListener("abort", cancel);
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        detach();
        reject(new DOMException("Operation cancelled", "AbortError"));
        queueMicrotask(() => {
          if (pending === shared && shared.leases.size === 0) {
            shared.abort.abort();
            void bridge.cancelCapture({ requestId: shared.id }).catch(() => {});
          }
        });
      };
      options.signal?.addEventListener("abort", cancel, { once: true });
      shared.promise.then(
        (value) => {
          if (!settled) {
            settled = true;
            detach();
            resolve(value);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            detach();
            reject(error);
          }
        },
      );
      if (options.signal?.aborted) cancel();
    });
  };
  return acquire;
}
const capture = createDocumentCapture(camera, async (photo, signal) => {
  const { readNativeCameraPhoto } = await import("./incoming");
  return readNativeCameraPhoto(photo, { signal });
});
export function captureNativeDocument(
  options: { signal?: AbortSignal } = {},
): Promise<PickedFile | "gallery" | null> {
  return capture(options);
}
