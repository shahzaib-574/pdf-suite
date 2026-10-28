import type { PickedFile } from "../lib/types";
import { appendScanPages } from "./scanInputPolicy";
export type CameraPhase =
  "camera" | "selecting" | "importing" | "reading" | "normalizing" | "error";
export type CameraProgress = {
  phase: CameraPhase;
  bytes?: number;
  files?: number;
  message?: string;
};
export type CameraFlowDeps = {
  capture: (signal: AbortSignal) => Promise<PickedFile | "gallery" | null>;
  gallery: (
    max: number,
    signal: AbortSignal,
    progress: (state: CameraProgress) => void,
  ) => Promise<File[] | null>;
  normalize: (
    files: File[],
    signal: AbortSignal,
    progress: (state: CameraProgress) => void,
  ) => Promise<PickedFile[]>;
  context: () => { pages: PickedFile[]; maxPages: number };
  receive: (pages: PickedFile[]) => void;
  close: () => void;
  state: (state: CameraProgress) => void;
};
export function createCameraFlow(deps: CameraFlowDeps) {
  let revision = 0,
    disposed = false,
    abort: AbortController | undefined;
  const publish = (lease: number, state: CameraProgress) => {
    if (!disposed && revision === lease) deps.state(state);
  };
  const run = async (galleryOnly: boolean) => {
    if (disposed) return;
    abort?.abort();
    const owner = new AbortController();
    abort = owner;
    const lease = ++revision;
    const current = () =>
      !disposed && revision === lease && !owner.signal.aborted;
    try {
      publish(lease, { phase: galleryOnly ? "selecting" : "camera" });
      const result = galleryOnly ? "gallery" : await deps.capture(owner.signal);
      if (!current()) return;
      if (!result) {
        deps.close();
        return;
      }
      let added: PickedFile[];
      if (result === "gallery") {
        publish(lease, { phase: "selecting" });
        const context = deps.context();
        const files = await deps.gallery(
          Math.max(1, context.maxPages - context.pages.length),
          owner.signal,
          (s) => publish(lease, s),
        );
        if (!current()) return;
        if (!files?.length) {
          deps.close();
          return;
        }
        publish(lease, { phase: "normalizing", files: 0 });
        added = await deps.normalize(files, owner.signal, (s) =>
          publish(lease, s),
        );
      } else added = [result];
      if (!current()) return;
      const { pages, maxPages } = deps.context();
      const next = appendScanPages(pages, added, maxPages);
      deps.receive(next);
    } catch (error) {
      if (current())
        publish(lease, {
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not complete the camera or gallery operation.",
        });
    }
  };
  return {
    start: () => run(false),
    chooseGallery: () => run(true),
    dispose: () => {
      disposed = true;
      ++revision;
      abort?.abort();
    },
  };
}
export type CameraFlow = ReturnType<typeof createCameraFlow>;
