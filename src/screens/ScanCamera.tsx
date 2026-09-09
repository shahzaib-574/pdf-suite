import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, Images, X } from "lucide-react";
import type { PickedFile } from "../lib/types";
import { fileListToPicked, toArrayBuffer } from "../store/files";
import { pickGalleryImages } from "../store/incoming";
import { useBackHandler, useOverlayBack } from "./back";
import { replaceWith } from "./nav";

export type ScanCameraProps = {
  pages: PickedFile[];
  maxPages: number;
  onPages: (pages: PickedFile[]) => void;
  onClose: () => void;
  onUse: () => void;
};

type CameraStatus = "starting" | "live" | "blocked" | "missing";

function cameraFailure(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "missing";
  return "blocked";
}

function statusCopy(status: CameraStatus): { title: string; body: string } {
  if (status === "starting") {
    return {
      title: "Starting camera",
      body: "Hold the page inside the frame.",
    };
  }
  if (status === "missing") {
    return {
      title: "No camera on this device",
      body: "Choose photos from the gallery instead.",
    };
  }
  return {
    title: "Camera needs permission",
    body: "Allow the camera, or choose photos from the gallery.",
  };
}

function viewfinderSource(
  video: HTMLVideoElement,
  frame: HTMLElement | null,
): { sx: number; sy: number; sw: number; sh: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!frame || vw < 2 || vh < 2) return { sx: 0, sy: 0, sw: vw, sh: vh };
  const videoBox = video.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  if (videoBox.width < 2 || frameBox.width < 2) return { sx: 0, sy: 0, sw: vw, sh: vh };
  const scale = Math.max(videoBox.width / vw, videoBox.height / vh);
  const originX = videoBox.left - (vw * scale - videoBox.width) / 2;
  const originY = videoBox.top - (vh * scale - videoBox.height) / 2;
  const x0 = Math.max(0, (frameBox.left - originX) / scale);
  const y0 = Math.max(0, (frameBox.top - originY) / scale);
  const x1 = Math.min(vw, (frameBox.right - originX) / scale);
  const y1 = Math.min(vh, (frameBox.bottom - originY) / scale);
  const sx = Math.floor(x0);
  const sy = Math.floor(y0);
  const sw = Math.max(1, Math.min(vw - sx, Math.ceil(x1) - sx));
  const sh = Math.max(1, Math.min(vh - sy, Math.ceil(y1) - sy));
  return { sx, sy, sw, sh };
}

async function captureFrame(
  video: HTMLVideoElement,
  frame: HTMLElement | null,
): Promise<PickedFile> {
  if (video.videoWidth < 2 || video.videoHeight < 2) {
    throw new Error("Camera is not ready yet.");
  }
  const source = viewfinderSource(
    video,
    frame ?? video.closest(".scan-cam")?.querySelector<HTMLElement>(".scan-cam__frame") ?? null,
  );
  // Match the image importer limit before encoding, avoiding a second decode/encode.
  const scale = Math.min(1, 3200 / Math.max(source.sw, source.sh));
  const width = Math.max(1, Math.round(source.sw * scale));
  const height = Math.max(1, Math.round(source.sh * scale));
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not capture this page.");
  context.drawImage(video, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
  try {
    const blob = "convertToBlob" in canvas
      ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })
      : await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/jpeg", 0.92);
        });
    if (!blob) throw new Error("Could not capture this page.");
    return {
      name: `scan-${Date.now()}.jpg`,
      mime: "image/jpeg",
      bytes: new Uint8Array(await blob.arrayBuffer()),
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function ScanCamera({
  pages,
  maxPages,
  onPages,
  onClose,
  onUse,
}: ScanCameraProps) {
  const galleryId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pagesRef = useRef(pages);
  const capturePending = useRef(false);
  const mounted = useRef(false);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const atLimit = pages.length >= maxPages;
  const canShoot = status === "live" && !busy && !atLimit;
  const copy = statusCopy(status);

  const thumbs = useMemo(
    () =>
      pages.map((page) =>
        URL.createObjectURL(
          new Blob([toArrayBuffer(page.bytes)], {
            type: page.mime || "image/jpeg",
          }),
        ),
      ),
    [pages],
  );
  const lastThumb = thumbs[thumbs.length - 1];
  useOverlayBack(onClose);
  useBackHandler(() => {
    onClose();
    if (pagesRef.current.length === 0) replaceWith("#/");
    return true;
  });

  useEffect(() => {
    return () => {
      for (const url of thumbs) URL.revokeObjectURL(url);
    };
  }, [thumbs]);

  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = document.querySelector<HTMLElement>(".app-frame");
    const previousInert = frame?.inert ?? false;
    if (frame) frame.inert = true;
    root.classList.add("is-scan-camera");
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      root.classList.remove("is-scan-camera");
      document.body.style.overflow = previousOverflow;
      if (frame) frame.inert = previousInert;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function startCamera(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setStatus("missing");
        return;
      }
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const node = videoRef.current ?? video;
        if (!node) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        node.srcObject = stream;
        node.muted = true;
        node.playsInline = true;
        await node.play();
        if (!cancelled) setStatus("live");
      } catch (error) {
        if (!cancelled) setStatus(cameraFailure(error));
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (video) video.srcObject = null;
    };
  }, [cameraAttempt]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Tab") {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".scan-cam button:not(:disabled)",
          ),
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function addImageFiles(files: FileList | File[]): Promise<void> {
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const incoming = await fileListToPicked(files, true);
      const combined = [...pagesRef.current, ...incoming];
      const next =
        combined.length > maxPages ? combined.slice(0, maxPages) : combined;
      pagesRef.current = next;
      onPages(next);
      if (combined.length > maxPages) {
        setMessage(`This scan can take ${maxPages} pages.`);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add that photo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function takePage(): Promise<void> {
    const video = videoRef.current;
    if (!video || !canShoot || capturePending.current) return;
    capturePending.current = true;
    setBusy(true);
    setMessage(null);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    try {
      const page = await captureFrame(video, frameRef.current);
      if (!mounted.current) return;
      const next = [...pagesRef.current, page].slice(0, maxPages);
      pagesRef.current = next;
      onPages(next);
    } catch (error) {
      if (!mounted.current) return;
      setMessage(
        error instanceof Error ? error.message : "Could not capture this page.",
      );
    } finally {
      capturePending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function onGalleryChange(event: ChangeEvent<HTMLInputElement>): void {
    const list = event.target.files;
    if (list && list.length > 0) void addImageFiles(list);
    event.target.value = "";
  }

  async function openGallery(): Promise<void> {
    if (busy || atLimit) return;
    const remaining = Math.max(1, maxPages - pagesRef.current.length);
    try {
      const native = await pickGalleryImages(remaining);
      if (native === null) {
        galleryRef.current?.click();
        return;
      }
      if (native.length) await addImageFiles(native);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add those photos.",
      );
    }
  }

  function retryCamera(): void {
    setMessage(null);
    setStatus("starting");
    setCameraAttempt((attempt) => attempt + 1);
  }

  const ui = (
    <div
      className="scan-cam"
      role="dialog"
      aria-modal="true"
      aria-label="Scan to PDF"
    >
      <video
        ref={videoRef}
        className="scan-cam__video"
        autoPlay
        muted
        playsInline
        aria-hidden={status !== "live"}
      />
      <div className="scan-cam__scrim" aria-hidden="true" />
      <div ref={frameRef} className="scan-cam__frame" aria-hidden="true">
        <span className="scan-cam__corner scan-cam__corner--tr" />
        <span className="scan-cam__corner scan-cam__corner--bl" />
      </div>
      {flash ? <div className="scan-cam__flash" aria-hidden="true" /> : null}

      <input
        ref={galleryRef}
        id={galleryId}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={onGalleryChange}
      />
      <header className="scan-cam__top">
        <button
          ref={closeRef}
          type="button"
          className="scan-cam__icon-btn"
          aria-label="Close camera"
          onClick={onClose}
        >
          <X size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {pages.length > 0 ? (
          <button type="button" className="scan-cam__use" onClick={onUse}>
            <Check size={18} strokeWidth={2.4} aria-hidden="true" />
            Use {pages.length} {pages.length === 1 ? "page" : "pages"}
          </button>
        ) : (
          <span className="scan-cam__top-spacer" aria-hidden="true" />
        )}
      </header>

      {status !== "live" ? (
        <div className="scan-cam__status">
          <p className="scan-cam__status-title">{copy.title}</p>
          <p>{copy.body}</p>
          {status === "blocked" ? (
            <button
              type="button"
              className="scan-cam__retry"
              onClick={() => void retryCamera()}
            >
              Allow camera
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className="scan-cam__toast" role="status">
          {message}
        </p>
      ) : null}

      <footer className="scan-cam__dock">
        <div className="scan-cam__pages">
          {lastThumb ? (
            <button
              type="button"
              className="scan-cam__stack"
              onClick={onUse}
              aria-label={`Review ${pages.length} ${pages.length === 1 ? "page" : "pages"}`}
            >
              <img src={lastThumb} alt="" />
              <span className="scan-cam__count tabular">{pages.length}</span>
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="scan-cam__shutter"
          aria-label="Take page"
          disabled={!canShoot}
          onClick={() => void takePage()}
        >
          <span className="scan-cam__shutter-ring" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="scan-cam__gallery"
          aria-label="Choose from gallery"
          disabled={busy || atLimit}
          onClick={() => {
            void openGallery();
          }}
        >
          <Images size={22} strokeWidth={2.1} aria-hidden="true" />
          <span>Gallery</span>
        </button>
      </footer>
    </div>
  );

  return createPortal(ui, document.body);
}
