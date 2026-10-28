import { StrictMode, useLayoutEffect, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  NativeScanCameraView,
  type CameraFlowFactory,
} from "../../../src/screens/NativeScanCamera";
import {
  createCameraFlow,
  type CameraProgress,
} from "../../../src/store/cameraFlow";
import {
  createDocumentCapture,
  type Capture,
} from "../../../src/store/documentCamera";
import "../../../src/index.css";
import "../../../src/screens/screens.css";
let root: Root | undefined,
  captureCalls = 0,
  cancelCalls = 0,
  readCalls = 0,
  abortedReadCalls = 0,
  received = 0,
  closed = 0;
let resolveCamera: (result: Capture) => void = () => {},
  rejectCamera: (error: Error) => void = () => {},
  resolveGallery: (files: File[]) => void = () => {},
  resolveNormalized: () => void = () => {},
  progress: (s: CameraProgress) => void = () => {};
let galleryAborted = false;
const commits: { captureCalls: number; headings: number; statuses: number }[] =
  [];
const frames: { captureCalls: number; text: string }[] = [];
function CommitProbe({ children }: PropsWithChildren) {
  useLayoutEffect(() => {
    const node = document.getElementById("fixture")!;
    commits.push({
      captureCalls,
      headings: node.querySelectorAll("h1").length,
      statuses: node.querySelectorAll('[role="status"]').length,
    });
    const id = requestAnimationFrame(() =>
      frames.push({ captureCalls, text: node.innerText }),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  return children;
}
const bridge = {
  capture: async () => {
    captureCalls++;
    return new Promise<Capture>((resolve, reject) => {
      resolveCamera = resolve;
      rejectCamera = reject;
    });
  },
  cancelCapture: async () => {
    cancelCalls++;
  },
};
const capture = createDocumentCapture(
  bridge,
  async (_, signal) => {
    readCalls++;
    if (signal.aborted) {
      abortedReadCalls++;
      throw new DOMException("Operation cancelled", "AbortError");
    }
    return {
      name: "synthetic.jpg",
      mime: "image/jpeg",
      bytes: new Uint8Array([1]),
    };
  },
  () => crypto.randomUUID(),
);
const factory: CameraFlowFactory = (deps) =>
  createCameraFlow({
    ...deps,
    capture: (signal) => capture({ signal }),
    gallery: async (_, signal, onProgress) => {
      signal.addEventListener(
        "abort",
        () => {
          galleryAborted = true;
        },
        { once: true },
      );
      progress = onProgress;
      return new Promise<File[]>((resolve) => {
        resolveGallery = resolve;
      });
    },
    normalize: async () =>
      new Promise((resolve) => {
        resolveNormalized = () =>
          resolve([
            {
              name: "synthetic.jpg",
              mime: "image/jpeg",
              bytes: new Uint8Array([1]),
            },
          ]);
      }),
  });
export function mount(strict = true) {
  root?.unmount();
  root = createRoot(document.getElementById("fixture")!);
  const view = (
    <CommitProbe>
      <NativeScanCameraView
        pages={[]}
        maxPages={3}
        onPages={() => {
          received++;
        }}
        onClose={() => {
          closed++;
        }}
        onUse={() => {}}
        createFlow={factory}
      />
    </CommitProbe>
  );
  root.render(strict ? <StrictMode>{view}</StrictMode> : view);
}
export function gallery() {
  resolveCamera({ gallery: true, id: "", name: "", mime: "", size: 0 });
}
export function importing() {
  progress({ phase: "importing", bytes: 4096 });
}
export function reading() {
  progress({ phase: "reading", bytes: 8192, files: 1 });
}
export function normalized() {
  resolveNormalized();
}
export function failed() {
  rejectCamera(
    new Error("Camera permission denied. Choose gallery or try again."),
  );
}
export function selected() {
  resolveGallery([
    new File([new Uint8Array([1])], "synthetic.jpg", { type: "image/jpeg" }),
  ]);
}
export function cancelled() {
  resolveCamera({ cancelled: true, id: "", name: "", mime: "", size: 0 });
}
export function photo() {
  resolveCamera({
    id: "synthetic-photo",
    name: "synthetic.jpg",
    mime: "image/jpeg",
    size: 1,
  });
}
export function trace() {
  return {
    captureCalls,
    cancelCalls,
    readCalls,
    abortedReadCalls,
    received,
    closed,
    galleryAborted,
    commits,
    frames,
  };
}
export function unmount() {
  root?.unmount();
  root = undefined;
}
