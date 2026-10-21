import { StrictMode, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as AppModule from "../../../src/App";
import { createCameraFlow } from "../../../src/store/cameraFlow";
import {
  createDocumentCapture,
  type Capture,
} from "../../../src/store/documentCamera";
import type { CameraFlowFactory } from "../../../src/screens/NativeScanCamera";
import { loadScanDraft, clearScanDraft } from "../../../src/store/scanDraft";
import { queueToolFiles } from "../../../src/store/toolInput";
import { engine } from "../../../src/pdf";
import { PDFDocument } from "pdf-lib";
import { setCurrentViewer } from "../../../src/store/lastJob";
import { navigate } from "../../../src/screens/nav";
import { handleAppBack } from "../../../src/screens/back";
import "../../../src/index.css";
let root: Root | undefined;
let captureCalls = 0,
  cancelCalls = 0,
  readCalls = 0;
let resolveCapture: (value: Capture) => void = () => {};
let rejectCapture: (value: Error) => void = () => {};
let releaseRead: () => void = () => {};
let draftReplies: (() => void)[] = [];
let holdDraft = false;
let photo: Uint8Array;
const capture = createDocumentCapture(
  {
    capture: async () => {
      captureCalls++;
      return new Promise<Capture>((r, j) => {
        resolveCapture = r;
        rejectCapture = j;
      });
    },
    cancelCapture: async () => {
      cancelCalls++;
    },
  },
  async (_, signal) => {
    readCalls++;
    await new Promise<void>((r) => {
      releaseRead = r;
    });
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    return { name: "synthetic.png", mime: "image/png", bytes: photo };
  },
);
let resolveGallery: (files: File[] | null) => void = () => {};
const factory: CameraFlowFactory = (deps) =>
  createCameraFlow({
    ...deps,
    capture: (signal) => capture({ signal }),
    gallery: async () =>
      new Promise((r) => {
        resolveGallery = r;
      }),
    normalize: async () => [
      { name: "synthetic.png", mime: "image/png", bytes: photo },
    ],
  });
type FixtureAppProps = {
  nativeScan?: { createFlow: CameraFlowFactory };
  loadNativeScanDraft?: typeof loadScanDraft;
};
export async function mount(origin = "#/", draftDelay = false, native = true) {
  root?.unmount();
  holdDraft = draftDelay;
  history.replaceState({ reamDepth: 0 }, "", origin);
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 180;
  canvas.getContext("2d")!.fillStyle = "white";
  canvas.getContext("2d")!.fillRect(0, 0, 120, 180);
  photo = new Uint8Array(
    await (
      await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!)))
    ).arrayBuffer(),
  );
  const App =
    (AppModule as unknown as { AppView?: ComponentType<FixtureAppProps> })
      .AppView ?? AppModule.default;
  root = createRoot(document.getElementById("fixture")!);
  root.render(
    <StrictMode>
      <App
        nativeScan={native ? { createFlow: factory } : undefined}
        loadNativeScanDraft={async () => {
          if (holdDraft)
            await new Promise<void>((r) => {
              draftReplies.push(r);
            });
          return loadScanDraft();
        }}
      />
    </StrictMode>,
  );
}
export function scan() {
  navigate("#/tool/scan");
}
export function route(hash: string) {
  navigate(hash);
}
export function cancelled() {
  resolveCapture({ cancelled: true, id: "", name: "", mime: "", size: 0 });
}
export function photoReturned() {
  resolveCapture({
    id: "synthetic",
    name: "synthetic.png",
    mime: "image/png",
    size: photo.length,
  });
}
export function finishRead() {
  releaseRead();
}
export function finishDraft() {
  holdDraft = false;
  draftReplies.splice(0).forEach((r) => r());
}
export function failed() {
  rejectCapture(new Error("Camera permission denied"));
}
export function gallery() {
  resolveCapture({ gallery: true, id: "", name: "", mime: "", size: 0 });
}
export function galleryCancel() {
  resolveGallery(null);
}
export function back() {
  handleAppBack();
}
export function trace() {
  return {
    captureCalls,
    cancelCalls,
    readCalls,
    hash: location.hash,
    title: document.title,
    depth: history.state?.reamDepth ?? 0,
  };
}
export function unmount() {
  root?.unmount();
  root = undefined;
}
export function clearDraft() {
  return clearScanDraft();
}
export async function draftMetadata() {
  const d = await loadScanDraft();
  return {
    lengths: d?.files.map((f) => f.bytes.length) ?? [],
    edits: d?.edits ?? [],
    step: d?.step,
  };
}
let finishJob: () => void = () => {};
let originalMerge = engine.merge;
export function prepareJob() {
  queueToolFiles(
    "merge",
    [0, 1].map((i) => ({
      name: `synthetic${i}.pdf`,
      mime: "application/pdf",
      bytes: new Uint8Array([1, 2]),
    })),
  );
  originalMerge = engine.merge;
  engine.merge = async () =>
    new Promise((r) => {
      finishJob = () =>
        r({ ok: true, filename: "synthetic.pdf", bytes: new Uint8Array([1]) });
    });
}
export function releaseJob() {
  finishJob();
  engine.merge = originalMerge;
}
export async function prepareViewer() {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]).drawText("Synthetic presentation fixture");
  setCurrentViewer(await doc.save(), "synthetic-presentation.pdf");
}
