import { Camera, Images, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PickedFile } from "../lib/types";
import { AnimatedButton } from "../components";
import { toArrayBuffer } from "../store/files";
import { applyScanEdit } from "../pdf/scanProcess";
import { validCorners, type Point, type ScanEdit } from "../pdf/scanGeometry";
const full = (): Point[] => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const WORKER_START = "WORKER_START";
async function applyPageEdit(
  original: PickedFile,
  edit: ScanEdit,
  assign: (job: Worker | null) => void,
): Promise<ArrayBuffer> {
  const bytes = toArrayBuffer(original.bytes);
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      let job: Worker;
      try {
        job = new Worker(new URL("../pdf/scanWorker.ts", import.meta.url), { type: "module" });
      } catch {
        reject(new Error(WORKER_START));
        return;
      }
      assign(job);
      job.onerror = () => {
        job.terminate();
        reject(new Error(WORKER_START));
      };
      job.onmessage = (event: MessageEvent<{ ok: boolean; bytes?: ArrayBuffer; message?: string }>) => {
        job.terminate();
        if (event.data.ok && event.data.bytes) resolve(event.data.bytes);
        else reject(new Error(event.data.message ?? "Could not adjust this page."));
      };
      job.postMessage({ bytes, mime: original.mime, edit }, { transfer: [bytes] });
    });
  } catch (error) {
    if (error instanceof Error && error.message === WORKER_START) {
      return applyScanEdit(toArrayBuffer(original.bytes), original.mime, edit);
    }
    throw error;
  } finally {
    assign(null);
  }
}
export function ScanEditor({
  files,
  onChange,
  onBusyChange,
  onDone,
  onCamera,
  onGallery,
}: {
  files: PickedFile[];
  onDone?: () => void;
  onCamera: () => void;
  onGallery: (files: FileList) => void;
  onChange: (original: PickedFile, file: PickedFile) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [index, setIndex] = useState(0),
    [corners, setCorners] = useState<Point[]>(full),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const slideWidth = useRef(1);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [rotation, setRotation] = useState(0);
  const [previewRotations, setPreviewRotations] = useState(new Map<PickedFile, number>());
  const [animateRotation, setAnimateRotation] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const drafts = useRef(new Map<PickedFile, {corners: Point[]; rotation: number; dirty: boolean}>());
  const touchStart = useRef<number | null>(null);
  const thumbnails = useMemo(() => files.map(file => URL.createObjectURL(new Blob([toArrayBuffer(file.bytes)], {type: file.mime}))), [files]);
  useEffect(() => () => thumbnails.forEach(URL.revokeObjectURL), [thumbnails]);
  const file = files[index];
  useEffect(() => () => {worker.current?.terminate();worker.current = null;}, []);
  function remember() {
    if (file) drafts.current.set(file, {corners, rotation, dirty});
  }
  function selectPage(next: number) {
    if (busy || next < 0 || next > files.length || next === index) return;
    remember();
    setAnimateRotation(false);
    const draft = files[next] ? drafts.current.get(files[next]!) : undefined;
    setIndex(next); setCorners(draft?.corners ?? full()); setRotation(draft?.rotation ?? 0); setDirty(draft?.dirty ?? false); setError("");
  }
  function rotatePreview(degrees: number) {
    setAnimateRotation(true);
    setRotation(current => current + degrees);
    if (file) setPreviewRotations(current => new Map(current).set(file, rotation + degrees));
    setDirty(true);
  }
  async function complete() {
    if (busy) return;
    remember();
    const pending = files.filter(item => drafts.current.get(item)?.dirty);
    if (pending.some(item => !validCorners(drafts.current.get(item)!.corners))) {
      setError("Corners must form a page without crossing. Check the crop on each edited page."); return;
    }
    if (!pending.length) {onDone?.();return;}
    setBusy(true); onBusyChange(true); setError("");
    try {
      // Process each page once, only after Next. Keep drafts intact if any page fails.
      const results: {original: PickedFile; changed: PickedFile}[] = [];
      for (const original of pending) {
        const draft = drafts.current.get(original)!;
        const edit: ScanEdit = {corners: draft.corners, mode: "color", rotate: ((draft.rotation % 360) + 360) % 360};
        const output = await applyPageEdit(original, edit, (job) => { worker.current = job; });
        results.push({original, changed: {...original, mime: "image/jpeg", name: original.name.replace(/\.[^.]+$/, ".jpg"), bytes: new Uint8Array(output)}});
      }
      for (const {original, changed} of results) { onChange(original, changed); drafts.current.delete(original); }
      setCorners(full());setRotation(0);setDirty(false);
      onDone?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not adjust the pages.");
    } finally {worker.current = null;setBusy(false);onBusyChange(false);}
  }
  const leave = (after: () => void) => {remember();after();};
  const turn = ((rotation % 360) + 360) % 360;
  const lastPage = files.length;
  const dragPx = drag ?? 0;
  const thumbPos = Math.max(0, Math.min(lastPage, index - dragPx / slideWidth.current));
  function onCarouselPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input")) return;
    touchStart.current = e.clientX;
    slideWidth.current = e.currentTarget.clientWidth || 1;
    setDrag(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCarouselPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const delta = e.clientX - touchStart.current;
    const atStart = index === 0 && delta > 0;
    const atEnd = index === lastPage && delta < 0;
    setDrag(atStart || atEnd ? delta * 0.22 : delta);
  }
  function onCarouselPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const delta = e.clientX - touchStart.current;
    touchStart.current = null;
    setDrag(null);
    if (Math.abs(delta) > 45) selectPage(index + (delta < 0 ? 1 : -1));
  }
  return (
    <section className="scan-edit" aria-label="Crop and Edit">
      <header className="scan-edit__header">
        <AnimatedButton variant="ghost" icon={X} aria-label="Return to camera" disabled={busy} onClick={() => leave(onCamera)} />
        <h1>Crop and Edit</h1>
        <span aria-live="polite">{index < files.length ? `${index + 1} / ${files.length}` : "Add pages"}</span>
      </header>
      <div className={`scan-edit__carousel${drag !== null ? " is-dragging" : ""}`} ref={carousel} role="region" aria-label="Scan pages" aria-roledescription="carousel" tabIndex={0}
        onKeyDown={e => { if ((e.target as HTMLElement).closest('button')) return; if(e.key === 'ArrowRight') selectPage(index + 1); if(e.key === 'ArrowLeft') selectPage(index - 1); }}
        onPointerDown={onCarouselPointerDown}
        onPointerMove={onCarouselPointerMove}
        onPointerUp={onCarouselPointerUp}
        onPointerCancel={() => {touchStart.current = null; setDrag(null);}}>
        <div className="scan-edit__track" style={{transform: `translateX(calc(-${index * 100}% + ${dragPx}px))`}}>
          {thumbnails.map((thumb, pageIndex) => <div className="scan-edit__slide" key={pageIndex} inert={index !== pageIndex} aria-hidden={index !== pageIndex}>
            <div className={`ps-scan-editor__image${animateRotation && pageIndex === index ? " is-rotating" : ""}`} style={{width: (pageIndex === index ? turn : previewRotations.get(files[pageIndex]!) ?? 0) % 180 ? `min(calc(100cqh - 24px), calc((100cqw - 64px) * ${ratios[thumb] ?? 0.75}))` : `min(calc(100cqw - 64px), calc((100cqh - 24px) * ${ratios[thumb] ?? 0.75}))`, transform: `rotate(${pageIndex === index ? rotation : previewRotations.get(files[pageIndex]!) ?? 0}deg)`}}>
              <img src={thumb} onLoad={e => { const img = e.currentTarget; const ratio = img.naturalWidth / img.naturalHeight; setRatios(current => current[thumb] === ratio ? current : {...current, [thumb]: ratio}); }} draggable={false} alt={`Scan page ${pageIndex + 1}`} />
              {index === pageIndex ? <><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map(p => `${p.x * 100},${p.y * 100}`).join(" ")} /></svg>
        {corners.map((p, i) => (
          <button
            type="button"
            key={i}
            className="ps-scan-corner"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            aria-label={`Corner ${i + 1}: use arrow keys to adjust`}
            disabled={busy}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const rect =
                e.currentTarget.parentElement!.getBoundingClientRect();
              const point = {
                x: Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width),
                ),
                y: Math.max(
                  0,
                  Math.min(1, (e.clientY - rect.top) / rect.height),
                ),
              };
              const adjusted = turn === 90 ? {x: point.y, y: 1-point.x} : turn === 180 ? {x: 1-point.x, y: 1-point.y} : turn === 270 ? {x: 1-point.y, y: point.x} : point;
              setDirty(true);
              setCorners((points) =>
                points.map((p, j) => (j === i ? adjusted : p)),
              );
            }}
            onPointerUp={(e) =>
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.05 : 0.01;
              const deltas: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const screenDelta = deltas[e.key];
              if (!screenDelta) return;
              const [dx, dy] = screenDelta;
              const d = turn === 90 ? [dy, -dx] : turn === 180 ? [-dx, -dy] : turn === 270 ? [-dy, dx] : screenDelta;
              e.preventDefault();
              setDirty(true);
              setCorners((points) =>
                points.map((p, j) =>
                  j === i
                    ? {
                        x: Math.max(0, Math.min(1, p.x + d[0]!)),
                        y: Math.max(0, Math.min(1, p.y + d[1]!)),
                      }
                    : p,
                ),
              );
            }}
          />
        ))}
              </> : null}
            </div>
          </div>)}
          <div className="scan-edit__slide" inert={index !== lastPage} aria-hidden={index !== lastPage}>
            <div className="scan-edit__add" role="group" aria-labelledby="scan-add-lead">
              <p id="scan-add-lead" className="scan-edit__add-lead">Add more using</p>
              <AnimatedButton icon={Camera} disabled={busy} onClick={() => leave(onCamera)}>Camera</AnimatedButton>
              <p className="scan-edit__add-or">OR</p>
              <AnimatedButton variant="ghost" icon={Images} disabled={busy} onClick={() => galleryInput.current?.click()}>Gallery</AnimatedButton>
              <input ref={galleryInput} className="sr-only" aria-label="Choose photos" type="file" accept="image/*" multiple disabled={busy} onChange={e => { if (e.target.files?.length) onGallery(e.target.files); e.target.value = ""; }} />
            </div>
          </div>
        </div>
        <div className="scan-edit__pager" aria-label="Select page">
          <div className="scan-edit__pager-well">
            <span className="scan-edit__pager-thumb" aria-hidden="true" style={{transform: `translateX(calc(${thumbPos} * var(--pager-slot)))`}} />
            {files.map((_, i) => <button type="button" key={i} aria-label={`Edit page ${i+1}`} aria-current={index === i ? "page" : undefined} disabled={busy} onClick={() => selectPage(i)} />)}
            <button type="button" aria-label="Add more pages" aria-current={index === lastPage ? "page" : undefined} disabled={busy} onClick={() => selectPage(lastPage)}><Plus size={14} strokeWidth={2.4} /></button>
          </div>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <footer className="scan-edit__toolbar">
        <AnimatedButton variant="ghost" icon={RotateCcw} aria-label="Rotate left" disabled={busy || index === lastPage} onClick={() => rotatePreview(-90)} />
        <AnimatedButton variant="ghost" icon={RotateCw} aria-label="Rotate right" disabled={busy || index === lastPage} onClick={() => rotatePreview(90)} />
        <span className="scan-edit__spacer" />
        <AnimatedButton variant="ghost" disabled={busy || index === lastPage} onClick={() => {setAnimateRotation(false);setCorners(full());setRotation(0);setDirty(false);if(file) {drafts.current.delete(file);setPreviewRotations(current => {const next = new Map(current);next.delete(file);return next;});}}}>Reset</AnimatedButton>
        <AnimatedButton disabled={busy} onClick={() => {void complete();}}>{busy ? "Preparing…" : "Next"}</AnimatedButton>
      </footer>
    </section>
  );
}
