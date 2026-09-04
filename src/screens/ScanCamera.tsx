import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Images, X } from 'lucide-react';
import type { PickedFile } from '../lib/types';
import { fileListToPicked, toArrayBuffer } from '../store/files';

export type ScanCameraProps = {
  pages: PickedFile[];
  maxPages: number;
  onPages: (pages: PickedFile[]) => void;
  onClose: () => void;
  onUse: () => void;
};

type CameraStatus = 'starting' | 'live' | 'blocked' | 'missing';

function cameraFailure(error: unknown): CameraStatus {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'blocked';
}

function statusCopy(status: CameraStatus): { title: string; body: string } {
  if (status === 'starting') {
    return { title: 'Starting camera', body: 'Hold the page inside the frame.' };
  }
  if (status === 'missing') {
    return {
      title: 'No camera on this device',
      body: 'Choose photos from the gallery instead.',
    };
  }
  return {
    title: 'Camera needs permission',
    body: 'Allow the camera, or choose photos from the gallery.',
  };
}

async function captureFrame(video: HTMLVideoElement): Promise<File> {
  if (video.videoWidth < 2 || video.videoHeight < 2) {
    throw new Error('Camera is not ready yet.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not capture this page.');
  context.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('Could not capture this page.');
  return new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
  const closeRef = useRef<HTMLButtonElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pagesRef = useRef(pages);
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const atLimit = pages.length >= maxPages;
  const canShoot = status === 'live' && !busy && !atLimit;
  const copy = statusCopy(status);

  const thumbs = useMemo(
    () =>
      pages.map((page) =>
        URL.createObjectURL(
          new Blob([toArrayBuffer(page.bytes)], { type: page.mime || 'image/jpeg' }),
        ),
      ),
    [pages],
  );
  const lastThumb = thumbs[thumbs.length - 1];

  useEffect(() => {
    return () => {
      for (const url of thumbs) URL.revokeObjectURL(url);
    };
  }, [thumbs]);

  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    root.classList.add('is-scan-camera');
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      root.classList.remove('is-scan-camera');
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;

    async function startCamera(): Promise<void> {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setStatus('missing');
        return;
      }
      setStatus('starting');
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (
          !cancelled &&
          devices.length > 0 &&
          !devices.some((device) => device.kind === 'videoinput')
        ) {
          setStatus('missing');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
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
        if (!cancelled) setStatus('live');
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
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function addImageFiles(files: FileList | File[]): Promise<void> {
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const incoming = await fileListToPicked(files, true);
      const combined = [...pagesRef.current, ...incoming];
      const next = combined.length > maxPages ? combined.slice(0, maxPages) : combined;
      pagesRef.current = next;
      onPages(next);
      if (combined.length > maxPages) {
        setMessage(`This scan can take ${maxPages} pages.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function takePage(): Promise<void> {
    const video = videoRef.current;
    if (!video || !canShoot) return;
    setBusy(true);
    setMessage(null);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    try {
      const file = await captureFrame(video);
      await addImageFiles([file]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not capture this page.');
      setBusy(false);
    }
  }

  function onGalleryChange(event: ChangeEvent<HTMLInputElement>): void {
    const list = event.target.files;
    if (list && list.length > 0) void addImageFiles(list);
    event.target.value = '';
  }

  async function retryCamera(): Promise<void> {
    setMessage(null);
    setStatus('starting');
    const previous = streamRef.current;
    if (previous) {
      for (const track of previous.getTracks()) track.stop();
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setStatus('live');
    } catch (error) {
      setStatus(cameraFailure(error));
    }
  }

  const ui = (
    <div className="scan-cam" role="dialog" aria-modal="true" aria-label="Scan to PDF">
      <video
        ref={videoRef}
        className="scan-cam__video"
        autoPlay
        muted
        playsInline
        aria-hidden={status !== 'live'}
      />
      <div className="scan-cam__scrim" aria-hidden="true" />
      <div className="scan-cam__frame" aria-hidden="true">
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
            Use {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </button>
        ) : (
          <span className="scan-cam__top-spacer" aria-hidden="true" />
        )}
      </header>

      {status !== 'live' ? (
        <div className="scan-cam__status">
          <p className="scan-cam__status-title">{copy.title}</p>
          <p>{copy.body}</p>
          {status === 'blocked' ? (
            <button type="button" className="scan-cam__retry" onClick={() => void retryCamera()}>
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
              aria-label={`Review ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
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
          onClick={() => galleryRef.current?.click()}
        >
          <Images size={22} strokeWidth={2.1} aria-hidden="true" />
          <span>Gallery</span>
        </button>
      </footer>
    </div>
  );

  return createPortal(ui, document.body);
}
