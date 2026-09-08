import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Camera, Images, Plus, RotateCcw, RotateCw, SquareArrowLeft, SquareArrowRight, Trash2, X } from "lucide-react";
import type { PickedFile } from "../lib/types";
import { AnimatedButton } from "../components";
import { useBackHandler } from "./back";
import { toArrayBuffer } from "../store/files";
import { fileArrayToFileList, pickGalleryImages } from "../store/incoming";
import { applyScanEdit } from "../pdf/scanProcess";
import { moveScanEdge, validCorners, type Point, type ScanEdit } from "../pdf/scanGeometry";
import { detectScanCorners } from "../pdf/scanDetect";
import type { ScanPageDraft } from "../store/scanDraft";
const full = (): Point[] => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const WORKER_START = "WORKER_START";
const PAGER_WINDOW = 6;
const CLEANUP_MODES = [
  { id: "color" as const, label: "Original color", short: "Color" },
  { id: "gray" as const, label: "Grayscale", short: "Gray" },
  { id: "bw" as const, label: "Black and white", short: "B&W" },
];
function pagerShift(active: number, count: number): number {
  if (count <= PAGER_WINDOW) return 0;
  const focus = Math.min(Math.max(0, active), count - 1);
  return Math.min(
    Math.max(0, focus - Math.floor((PAGER_WINDOW - 1) / 2)),
    count - PAGER_WINDOW,
  );
}
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
  onDiscard,
  maxPages,
  initialEdits = [],
  onDrafts,
  onFiles,
  onRetake,
}: {
  files: PickedFile[];
  onDone?: () => void;
  onCamera: () => void;
  onGallery: (files: FileList) => void;
  onDiscard: () => void;
  maxPages: number;
  initialEdits?: (ScanPageDraft | null)[];
  onDrafts?: (edits: (ScanPageDraft | null)[]) => void;
  onFiles: (files: PickedFile[]) => void;
  onRetake: (index: number) => void;
  onChange: (original: PickedFile, file: PickedFile) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [index, setIndex] = useState(0),
    [corners, setCorners] = useState<Point[]>(() => initialEdits[0]?.corners ?? full()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const worker = useRef<Worker | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const pagerView = useRef<HTMLDivElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [slideWidth, setSlideWidth] = useState(1);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [rotation, setRotation] = useState(initialEdits[0]?.rotation ?? 0);
  const [mode, setMode] = useState<ScanEdit['mode']>(initialEdits[0]?.mode ?? 'color');
  const [detecting, setDetecting] = useState(false);
  const [filterPreviews, setFilterPreviews] = useState<{file:PickedFile;gray:string;bw:string} | null>(null);
  const detectionVersion = useRef(0);
  const [previewRotations, setPreviewRotations] = useState(() => new Map(files.map((file,i) => [file,initialEdits[i]?.rotation ?? 0])));
  const [animateRotation, setAnimateRotation] = useState(false);
  const [dirty, setDirty] = useState(initialEdits[0]?.dirty ?? false);
  const [drag, setDrag] = useState<number | null>(null);
  const [imageActionsOpen, setImageActionsOpen] = useState(false);
  const drafts = useRef(new Map<PickedFile, ScanPageDraft>(files.flatMap((file, i) => initialEdits[i] ? [[file, initialEdits[i]!] as const] : [])));
  const touchStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const edgeDrag = useRef<{pointerId:number;edge:number;x:number;y:number;width:number;height:number;points:Point[]} | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  useBackHandler(() => {
    if (!confirmDiscard) return false;
    setConfirmDiscard(false);
    return true;
  });
  useLayoutEffect(() => {
    // Each setup owns fresh URLs, including React StrictMode's setup replay.
    // A memoized URL can outlive the cleanup that revoked it.
    const urls = files.map(file => URL.createObjectURL(new Blob([toArrayBuffer(file.bytes)], {type:file.mime})));
    // oxlint-disable-next-line react/set-state-in-effect -- Publish owned browser resources before paint.
    setThumbnails(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  const file = files[index];
  useLayoutEffect(() => {
    // Never reuse a revoked cleanup preview when returning to a previous page.
    // oxlint-disable-next-line react/set-state-in-effect -- Detach the previous URL before its resource is released.
    setFilterPreviews(null);
    if(!file) return;
    let cancelled=false;
    const urls:string[]=[];
    void (async () => {
      const bitmap=await createImageBitmap(new Blob([toArrayBuffer(file.bytes)],{type:file.mime}));
      const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));
      const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
      canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await canvas.convertToBlob({type:'image/png'});
      const grayBytes=await applyScanEdit(await blob.arrayBuffer(),'image/png',{corners:full(),mode:'gray',rotate:0});
      const bwBytes=await applyScanEdit(await blob.arrayBuffer(),'image/png',{corners:full(),mode:'bw',rotate:0});
      const gray=URL.createObjectURL(new Blob([grayBytes],{type:'image/png'}));
      const bw=URL.createObjectURL(new Blob([bwBytes],{type:'image/png'}));
      if(cancelled){URL.revokeObjectURL(gray);URL.revokeObjectURL(bw);return;}
      urls.push(gray,bw);
      setFilterPreviews({file,gray,bw});
    })().catch(()=>{if(!cancelled)setError('Cleanup preview is unavailable. Check the PDF preview after Next.');});
    return()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
  }, [file]);
  const draftCallback = useRef(onDrafts);
  useEffect(() => { draftCallback.current = onDrafts; }, [onDrafts]);
  useEffect(() => {
    if (file) drafts.current.set(file, { corners, rotation, dirty, mode });
    draftCallback.current?.(files.map(item => drafts.current.get(item) ?? null));
  }, [files, file, corners, rotation, dirty, mode]);
  useEffect(() => () => { detectionVersion.current++; }, []);
  useEffect(() => () => {worker.current?.terminate();worker.current = null;}, []);
  function remember() {
    if (file) drafts.current.set(file, {corners, rotation, dirty, mode});
  }
  function selectPage(next: number) {
    if (busy || next < 0 || next > files.length || next === index) return;
    remember();
    detectionVersion.current++; setDetecting(false);
    setImageActionsOpen(false);
    setAnimateRotation(false);
    const draft = files[next] ? drafts.current.get(files[next]!) : undefined;
    setIndex(next); setCorners(draft?.corners ?? full()); setRotation(draft?.rotation ?? 0); setMode(draft?.mode ?? 'color'); setDirty(draft?.dirty ?? false); setError("");
  }
  async function autoCrop() {
    if (!file || busy || detecting) return;
    const version = ++detectionVersion.current;
    setDetecting(true); setError('');
    try {
      const points = await detectScanCorners(new Blob([toArrayBuffer(file.bytes)], {type:file.mime}));
      if (version !== detectionVersion.current) return;
      if (points) { setCorners(points); setDirty(true); }
      else setError('Page edges are unclear. Move the four corners to crop manually.');
    } catch { if(version === detectionVersion.current) setError('Could not detect edges. You can still crop manually.'); }
    finally { if(version === detectionVersion.current) setDetecting(false); }
  }
  function changePages(next: PickedFile[], nextIndex: number) {
    remember(); detectionVersion.current++;setDetecting(false);
    setImageActionsOpen(false);
    const draft = next[nextIndex] ? drafts.current.get(next[nextIndex]!) : undefined;
    setIndex(nextIndex);setCorners(draft?.corners ?? full());setRotation(draft?.rotation ?? 0);setMode(draft?.mode ?? 'color');setDirty(draft?.dirty ?? false);
    onFiles(next);
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
        const edit: ScanEdit = {corners: draft.corners, mode: draft.mode, rotate: ((draft.rotation % 360) + 360) % 360};
        const output = await applyPageEdit(original, edit, (job) => { worker.current = job; });
        results.push({original, changed: {...original, scanSource: original.scanSource ?? {name:original.name,mime:original.mime,bytes:original.bytes}, mime: "image/png", name: original.name.replace(/\.[^.]+$/, ".png"), bytes: new Uint8Array(output)}});
      }
      for (const {original, changed} of results) { onChange(original, changed); drafts.current.delete(original); }
      setCorners(full());setRotation(0);setMode('color');setDirty(false);
      onDone?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not adjust the pages.");
    } finally {worker.current = null;setBusy(false);onBusyChange(false);}
  }
  const leave = (after: () => void) => {remember();after();};
  const turn = ((rotation % 360) + 360) % 360;
  const lastPage = files.length;
  const dragPx = drag ?? 0;
  const visual = Math.max(0, Math.min(lastPage, index - dragPx / slideWidth));
  const pagerCount = Math.min(files.length, PAGER_WINDOW);
  const pagerOffset = pagerShift(visual >= files.length ? files.length - 1 : visual, files.length);
  const thumbPos = visual >= files.length ? pagerCount : visual - pagerOffset;
  useLayoutEffect(() => {
    if (pagerView.current) pagerView.current.scrollLeft = 0;
  }, [index, pagerOffset, files.length]);
  function onCarouselPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, label")) return;
    touchStart.current = e.clientX;
    dragged.current = false;
    setSlideWidth(e.currentTarget.clientWidth || 1);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCarouselPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const delta = e.clientX - touchStart.current;
    if (!dragged.current && Math.abs(delta) < 8) return;
    dragged.current = true;
    const atStart = index === 0 && delta > 0;
    const atEnd = index === lastPage && delta < 0;
    setDrag(atStart || atEnd ? delta * 0.22 : delta);
  }
  function onCarouselPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (touchStart.current === null) return;
    const delta = e.clientX - touchStart.current;
    const swiped = dragged.current && Math.abs(delta) > 45;
    const tapped = !dragged.current && Math.abs(delta) < 8;
    touchStart.current = null;
    dragged.current = false;
    setDrag(null);
    if (swiped) {
      setImageActionsOpen(false);
      selectPage(index + (delta < 0 ? 1 : -1));
      return;
    }
    if (
      tapped &&
      file &&
      !(e.target as HTMLElement).closest("button, input, select, label")
    ) {
      setImageActionsOpen((open) => !open);
    }
  }
  async function openGallery(): Promise<void> {
    if (busy) return;
    const remaining = Math.max(1, maxPages - files.length);
    try {
      const native = await pickGalleryImages(remaining);
      if (native === null) {
        galleryInput.current?.click();
        return;
      }
      if (native.length) onGallery(fileArrayToFileList(native));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add those photos.");
    }
  }
  return (
    <section className="scan-edit" aria-label="Crop and Edit">
      <header className="scan-edit__header">
        <AnimatedButton variant="ghost" icon={X} aria-label="Return to camera" disabled={busy} onClick={() => leave(onCamera)} />
        <h1>Crop and Edit</h1>
        <AnimatedButton
          type="button"
          variant="ghost"
          className="scan-edit__discard"
          aria-haspopup="dialog"
          aria-expanded={confirmDiscard}
          onClick={() => setConfirmDiscard(true)}
        >
          Discard
        </AnimatedButton>
      </header>
      <div className={`scan-edit__carousel${drag !== null ? " is-dragging" : ""}`} ref={carousel} role="region" aria-label="Scan pages" aria-roledescription="carousel" tabIndex={0}
        onKeyDown={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          if(e.key === 'ArrowRight') selectPage(index + 1);
          if(e.key === 'ArrowLeft') selectPage(index - 1);
          if ((e.key === 'Enter' || e.key === ' ') && file) {
            e.preventDefault();
            setImageActionsOpen(open => !open);
          }
        }}
        onPointerDown={onCarouselPointerDown}
        onPointerMove={onCarouselPointerMove}
        onPointerUp={onCarouselPointerUp}
        onPointerCancel={() => {touchStart.current = null; dragged.current = false; setDrag(null);}}>
        <div className="scan-edit__track" style={{transform: `translateX(calc(-${index * 100}% + ${dragPx}px))`}}>
          {thumbnails.map((thumb, pageIndex) => <div className="scan-edit__slide" key={pageIndex} inert={index !== pageIndex} aria-hidden={index !== pageIndex}>
            <div className="scan-edit__preview">
            <div className={`ps-scan-editor__image${animateRotation && pageIndex === index ? " is-rotating" : ""}`} style={{width: (pageIndex === index ? turn : previewRotations.get(files[pageIndex]!) ?? 0) % 180 ? `min(calc(100cqh - 24px), calc((100cqw - 64px) * ${ratios[thumb] ?? 0.75}))` : `min(calc(100cqw - 64px), calc((100cqh - 24px) * ${ratios[thumb] ?? 0.75}))`, transform: `rotate(${pageIndex === index ? rotation : previewRotations.get(files[pageIndex]!) ?? 0}deg)`}}>
              <img src={pageIndex===index && mode!=='color' && filterPreviews?.file===file ? (mode==='gray' ? filterPreviews.gray : filterPreviews.bw) : thumb} onLoad={e => { const img = e.currentTarget; const ratio = img.naturalWidth / img.naturalHeight; setRatios(current => current[thumb] === ratio ? current : {...current, [thumb]: ratio}); }} draggable={false} alt={`Scan page ${pageIndex + 1}`} />
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
              detectionVersion.current++;setDetecting(false);
              setImageActionsOpen(false);
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
        {corners.map((point, edge) => {
          const end = corners[(edge + 1) % 4]!;
          const side = ['Top', 'Right', 'Bottom', 'Left'][(edge + turn / 90) % 4];
          const angle = Math.atan2(end.y - point.y, (end.x - point.x) * (ratios[thumb] ?? 0.75)) * 180 / Math.PI;
          return <button key={`edge-${edge}`} type="button" className="ps-scan-edge"
            style={{left:`${(point.x+end.x)*50}%`,top:`${(point.y+end.y)*50}%`,transform:`translate(-50%, -50%) rotate(${angle}deg)`}}
            aria-label={`${side} edge: drag or use arrow keys to adjust`} disabled={busy}
            onPointerDown={event => {
              event.stopPropagation();detectionVersion.current++;setDetecting(false);
              setImageActionsOpen(false);
              const rect=event.currentTarget.parentElement!.getBoundingClientRect();
              edgeDrag.current={pointerId:event.pointerId,edge,x:event.clientX,y:event.clientY,width:rect.width,height:rect.height,points:corners};
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
              const start=edgeDrag.current;
              if(!start || start.edge!==edge || start.pointerId!==event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId))return;
              event.stopPropagation();
              const dx=(event.clientX-start.x)/start.width,dy=(event.clientY-start.y)/start.height;
              const local=turn===90 ? [dy,-dx] : turn===180 ? [-dx,-dy] : turn===270 ? [-dy,dx] : [dx,dy];
              setCorners(moveScanEdge(start.points,edge,local[edge%2===0 ? 1 : 0]!));setDirty(true);
            }}
            onPointerUp={event => {event.stopPropagation();edgeDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
            onPointerCancel={() => {edgeDrag.current=null;}}
            onLostPointerCapture={() => {edgeDrag.current=null;}}
            onKeyDown={event => {
              const step=event.shiftKey ? .05 : .01;
              const delta:Record<string,number[]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
              const d=delta[event.key];if(!d)return;
              event.preventDefault();event.stopPropagation();detectionVersion.current++;setDetecting(false);
              const [dx,dy]=d as [number,number];
              const local=turn===90 ? [dy,-dx] : turn===180 ? [-dx,-dy] : turn===270 ? [-dy,dx] : [dx,dy];
              setCorners(points=>moveScanEdge(points,edge,local[edge%2===0 ? 1 : 0]!));setDirty(true);
            }} />;
        })}
              </> : null}
            </div>
            {pageIndex === index && imageActionsOpen && file ? (
              <div className="scan-edit__image-actions" role="group" aria-label="Capture actions" onPointerDown={event => event.stopPropagation()}>
                <button type="button" disabled={busy || detecting} onClick={() => void autoCrop()}>
                  {detecting ? "Finding edges…" : "Auto crop"}
                </button>
                <button type="button" disabled={busy} onClick={() => leave(() => onRetake(index))}>
                  Retake
                </button>
              </div>
            ) : null}
            </div>
          </div>)}
          <div className="scan-edit__slide" inert={index !== lastPage} aria-hidden={index !== lastPage}>
            <div className="scan-edit__add" role="group" aria-labelledby="scan-add-lead">
              <p id="scan-add-lead" className="scan-edit__add-lead">Add more using</p>
              <AnimatedButton icon={Camera} disabled={busy} onClick={() => leave(onCamera)}>Camera</AnimatedButton>
              <p className="scan-edit__add-or">OR</p>
              <AnimatedButton variant="ghost" icon={Images} disabled={busy} onClick={() => { void openGallery(); }}>Gallery</AnimatedButton>
              <input ref={galleryInput} className="sr-only" aria-label="Choose photos" type="file" accept="image/*" multiple disabled={busy} onChange={e => { if (e.target.files?.length) onGallery(e.target.files); e.target.value = ""; }} />
            </div>
          </div>
        </div>
        <div className="scan-edit__pager" aria-label="Select page">
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={SquareArrowLeft}
            aria-label="Move earlier"
            disabled={busy || !file || index === 0}
            onClick={() => {const next=[...files];[next[index-1],next[index]]=[next[index]!,next[index-1]!];changePages(next,index-1);}}
          />
          <div className="scan-edit__pager-well">
            <span className="scan-edit__pager-thumb" aria-hidden="true" style={{transform: `translateX(calc(${thumbPos} * var(--pager-slot)))`}} />
            <div
              ref={pagerView}
              className="scan-edit__pager-view"
              style={{width: `calc(${pagerCount} * var(--pager-slot))`}}
              onScroll={(event) => { event.currentTarget.scrollLeft = 0; }}
              onFocusCapture={() => { if (pagerView.current) pagerView.current.scrollLeft = 0; }}
            >
              <div className="scan-edit__pager-track" style={{width: `calc(${files.length} * var(--pager-slot))`, transform: `translateX(calc(${-pagerOffset} * var(--pager-slot)))`}}>
                {files.map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    aria-label={`Edit page ${i + 1}`}
                    aria-current={index === i ? "page" : undefined}
                    disabled={busy}
                    onClick={() => selectPage(i)}
                  />
                ))}
              </div>
            </div>
            <button type="button" aria-label="Add more pages" aria-current={index === lastPage ? "page" : undefined} disabled={busy} onClick={() => selectPage(lastPage)}><Plus size={14} strokeWidth={2.4} /></button>
          </div>
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={SquareArrowRight}
            aria-label="Move later"
            disabled={busy || !file || index >= files.length-1}
            onClick={() => {const next=[...files];[next[index+1],next[index]]=[next[index]!,next[index+1]!];changePages(next,index+1);}}
          />
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {file ? (
      <div className="scan-edit__options" aria-label="Page adjustments">
        <div className="scan-edit__filters" role="radiogroup" aria-label="Scan cleanup">
          {CLEANUP_MODES.map((filter) => {
            const processed = filterPreviews?.file === file ? filterPreviews : null;
            const src = filter.id === "color" || !processed
              ? thumbnails[index]
              : filter.id === "gray" ? processed.gray : processed.bw;
            return (
              <button
                key={filter.id}
                type="button"
                role="radio"
                data-mode={filter.id}
                aria-label={filter.label}
                aria-checked={mode === filter.id}
                disabled={busy}
                onClick={() => {setMode(filter.id);setDirty(true);}}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    style={filter.id === "color" || processed ? undefined : {filter: filter.id === "bw" ? "grayscale(1) contrast(1.7)" : "grayscale(1)"}}
                  />
                ) : (
                  <span className="scan-edit__filter-blank" aria-hidden="true" />
                )}
                <span aria-hidden="true">{filter.short}</span>
              </button>
            );
          })}
        </div>
        {file.scanSource ? <button type="button" disabled={busy} onClick={() => {const next=[...files];next[index]=file.scanSource!;changePages(next,index);}}>Restore original</button> : null}
      </div>
      ) : null}
      <footer className="scan-edit__toolbar">
        <AnimatedButton variant="ghost" icon={RotateCcw} aria-label="Rotate left" disabled={busy || index === lastPage} onClick={() => rotatePreview(-90)} />
        <AnimatedButton variant="ghost" icon={RotateCw} aria-label="Rotate right" disabled={busy || index === lastPage} onClick={() => rotatePreview(90)} />
        <AnimatedButton variant="ghost" className="scan-edit__delete" icon={Trash2} aria-label="Delete page" disabled={busy || !file} onClick={() => changePages(files.filter((_, i) => i !== index), Math.max(0, index - 1))} />
        <span className="scan-edit__spacer" />
        <AnimatedButton variant="ghost" disabled={busy || index === lastPage} onClick={() => {detectionVersion.current++;setDetecting(false);setAnimateRotation(false);setCorners(full());setRotation(0);setMode('color');setDirty(false);if(file) {drafts.current.delete(file);setPreviewRotations(current => {const next = new Map(current);next.delete(file);return next;});}}}>Reset</AnimatedButton>
        <AnimatedButton disabled={busy} onClick={() => {void complete();}}>{busy ? "Preparing…" : "Next"}</AnimatedButton>
      </footer>
      {confirmDiscard ? (
        <div
          className="scan-edit__confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="scan-discard-title"
          aria-describedby="scan-discard-copy"
          onClick={() => setConfirmDiscard(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setConfirmDiscard(false);
            }
          }}
        >
          <div
            className="scan-edit__confirm-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="scan-discard-title">Are you sure?</h2>
            <p id="scan-discard-copy">
              This discards the scan and takes you home.
            </p>
            <div className="ps-row">
              <AnimatedButton
                variant="ghost"
                autoFocus
                onClick={() => setConfirmDiscard(false)}
              >
                Cancel
              </AnimatedButton>
              <AnimatedButton
                variant="danger"
                onClick={() => {
                  worker.current?.terminate();
                  worker.current = null;
                  onDiscard();
                }}
              >
                Discard
              </AnimatedButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
