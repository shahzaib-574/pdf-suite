import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from 'react-dom';
import { useBackHandler } from './back';
import type { ScanCameraProps } from "./ScanCamera";
import { captureNativeDocument } from "../store/documentCamera";
import { fileListToScanImages } from "../store/files";
import { pickGalleryImages } from "../store/incoming";
import {
  createCameraFlow,
  type CameraFlow,
  type CameraFlowDeps,
  type CameraProgress,
} from "../store/cameraFlow";
export type CameraFlowFactory = (
  deps: Pick<CameraFlowDeps, "context" | "receive" | "close" | "state">,
) => CameraFlow;
const nativeFactory: CameraFlowFactory = (deps) =>
  createCameraFlow({
    ...deps,
    capture: (signal) => captureNativeDocument({ signal }),
    gallery: (max, signal, onProgress) =>
      pickGalleryImages(max, { signal, onProgress }),
    normalize: (files, signal, onProgress) =>
      fileListToScanImages(files, { signal, onProgress }),
  });
const phaseCopy = {
  selecting: "Choose photos in the Android gallery\u2026",
  importing: "Importing selected photos\u2026",
  reading: "Reading selected photos\u2026",
  normalizing: "Preparing scan photos\u2026",
  error: "",
};
/** Real lifecycle/view shared with isolated typed fixtures; the product wrapper injects native only. */
export function NativeScanCameraView(
  props: ScanCameraProps & { createFlow: CameraFlowFactory },
) {
  const { createFlow, onPresentation } = props;
  const current = useRef(props);
  useLayoutEffect(() => {
    current.current = props;
  }, [props]);
  const flow = useRef<CameraFlow | undefined>(undefined);
  const [state, setState] = useState<CameraProgress>({ phase: "camera" });
  useLayoutEffect(() => {
    let active = true;
    const owner = createFlow({
      context: () => ({
        pages: current.current.pages,
        maxPages: current.current.maxPages,
      }),
      receive: (pages) => current.current.onPages(pages),
      close: () => current.current.onClose(),
      state: (next) => {
        if (active) setState(next);
      },
    });
    flow.current = owner;
    void owner.start();
    return () => {
      active = false;
      owner.dispose();
      if (flow.current === owner) flow.current = undefined;
    };
  }, [createFlow]);
  const back = () => {
    flow.current?.dispose();
    current.current.onClose();
  };
  useBackHandler(() => { back(); return true; });
  useLayoutEffect(() => {
    onPresentation?.(state.phase === 'camera' ? 'pending' : 'explicit');
  }, [state.phase, onPresentation]);
  if (state.phase === 'camera') return createPortal(
    <button autoFocus className="btn native-capture-cancel" onClick={back}>Cancel camera</button>,
    document.body,
  );
  return (
    <section className="ps-screen" aria-label="Document camera">
      <div className="ps-body">
        <h1>Document camera</h1>
        {state.phase === "error" ? (
          <>
            <p className="ps-banner ps-banner--error" role="alert">{state.message}</p>
            <div className="ps-row">
              <button className="btn" onClick={() => void flow.current?.start()}>
                Try camera again
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => void flow.current?.chooseGallery()}
              >
                Choose from gallery
              </button>
            </div>
          </>
        ) : (
          <p className="ps-note" role="status">
            {phaseCopy[state.phase]}
            {state.bytes ? ` ${Math.ceil(state.bytes / 1024)} KB read` : ""}
            {state.files ? ` \u00b7 ${state.files} photos` : ""}
          </p>
        )}
        <button className="btn btn--ghost" onClick={back}>
          Back to scan
        </button>
      </div>
    </section>
  );
}
export function NativeScanCamera(props: ScanCameraProps) {
  return <NativeScanCameraView {...props} createFlow={nativeFactory} />;
}
