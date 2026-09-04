import { useEffect, useMemo, useState } from 'react';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { AnimatedButton, FileWell, PageHeader, ProgressHud } from '../components';
import { ScanCamera } from './ScanCamera';
import { TOOLS, type ToolDef } from '../lib/catalog';
import type {
  CompressLevel,
  JobResult,
  OrganizeOp,
  PdfToDocxProgress,
  PickedFile,
  ToolId,
} from '../lib/types';
import { engine } from '../pdf';
import { usePro } from '../store/entitlements';
import { fileListToPicked } from '../store/files';
import {
  setCurrentViewer,
  setLastJob,
} from '../store/lastJob';
import { saveRecent } from '../store/recents';
import { takePendingScan, takePendingScanError } from '../store/pendingScan';
import { goBack, navigate } from './nav';

type ToolFlowProps = {
  id: ToolId;
};

const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<
  ToolId,
  ToolDef
>;

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: 'strong', label: 'Small' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'keep', label: 'High quality' },
];

const TOOLS_WITH_OPTIONS = new Set<ToolId>([
  'split',
  'compress',
  'organize',
  'watermark',
  'protect',
]);

const ACTION_LABELS: Record<Exclude<ToolId, 'view'>, string> = {
  merge: 'Merge PDFs',
  split: 'Extract pages',
  images: 'Create PDF',
  'pdf-images': 'Export images',
  compress: 'Compress PDF',
  scan: 'Create scanned PDF',
  organize: 'Apply page changes',
  watermark: 'Add watermark',
  numbers: 'Add page numbers',
  protect: 'Protect PDF',
  'docx-pdf': 'Convert to PDF',
  'pdf-docx': 'Convert to Word',
};

function acceptAttr(accept: ToolDef['accept']): string {
  if (accept === 'images') return 'image/*';
  if (accept === 'docx') {
    return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/pdf';
}

function wellCopy(id: ToolId, minFiles: number): { label: string; hint: string } {
  switch (id) {
    case 'merge':
      return { label: 'Add PDFs', hint: `At least ${minFiles} files` };
    case 'images':
      return { label: 'Add images', hint: 'JPG, PNG, or WebP' };
    case 'scan':
      return { label: 'Add pages', hint: 'Camera or gallery' };
    case 'view':
      return { label: 'Open a PDF', hint: 'Stays on this device' };
    case 'docx-pdf':
      return { label: 'Choose a Word file', hint: 'DOCX only. Layout is simplified.' };
    case 'pdf-docx':
      return { label: 'Choose a PDF', hint: 'Rebuilds text into Word' };
    default:
      return { label: 'Choose a PDF', hint: 'Stays on this device' };
  }
}

function takeInitialScan(id: ToolId): {
  files: PickedFile[];
  error: string | null;
} {
  if (id !== 'scan') return { files: [], error: null };
  return {
    files: takePendingScan(),
    error: takePendingScanError(),
  };
}

export function ToolFlow({ id }: ToolFlowProps) {
  const tool = TOOL_BY_ID[id];
  const pro = usePro();
  const [initialScan] = useState(() => takeInitialScan(id));
  const [picked, setPicked] = useState<PickedFile[]>(initialScan.files);
  const [cameraOpen, setCameraOpen] = useState(
    () => id === 'scan' && initialScan.files.length === 0,
  );
  const [busy, setBusy] = useState(false);
  const [jobProgress, setJobProgress] = useState<number | undefined>();
  const [jobLabel, setJobLabel] = useState('Working on-device…');
  const [error, setError] = useState<string | null>(initialScan.error);
  const [pageCount, setPageCount] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [compressLevel, setCompressLevel] = useState<CompressLevel>('balanced');
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.28);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rotateAll, setRotateAll] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [removedPages, setRemovedPages] = useState<number[]>([]);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});

  const locked = !pro && tool.pro;
  const maxFiles = pro ? Number.POSITIVE_INFINITY : tool.maxFilesFree;
  const scanMaxPages = Number.isFinite(maxFiles) ? Math.max(1, maxFiles) : 20;
  const multiple = tool.accept === 'pdfs' || tool.accept === 'images';
  const copy = wellCopy(tool.id, tool.minFiles);
  const wellItems = useMemo(
    () => picked.map((file) => ({ name: file.name, size: file.bytes.byteLength })),
    [picked],
  );

  useEffect(() => {
    const file = picked[0];
    if (!file || (tool.id !== 'split' && tool.id !== 'organize')) return;
    let cancelled = false;
    void engine
      .pageCount(file)
      .then((count) => {
        if (cancelled) return;
        setPageCount(count);
        setStartPage(1);
        setEndPage(Math.max(1, count));
        setPageOrder(Array.from({ length: count }, (_, index) => index));
        setRemovedPages([]);
        setPageRotations({});
        setRotateAll(false);
        setReverse(false);
      })
      .catch(() => {
        if (!cancelled) setPageCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [picked, tool.id]);

  useEffect(() => {
    if (tool.id !== 'organize' || !picked[0] || pageCount < 1) return;
    let cancelled = false;
    const urls: string[] = [];
    const file = picked[0];
    void (async () => {
      const n = Math.min(pageCount, 30);
      for (let i = 0; i < n; i++) {
        try {
          const blob = await engine.renderPage(file, i, 96);
          if (cancelled) return;
          if (blob.size === 0) continue;
          urls.push(URL.createObjectURL(blob));
        } catch {
          break;
        }
      }
      if (!cancelled) setThumbs([...urls]);
    })();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [tool.id, picked, pageCount]);

  async function onPick(fileList: FileList): Promise<void> {
    setError(null);
    try {
      const incoming = await fileListToPicked(
        fileList,
        tool.accept === 'images',
      );
      const combined = multiple ? [...picked, ...incoming] : incoming;
      if (Number.isFinite(maxFiles) && combined.length > maxFiles) {
        setError(
          `Free limit is ${tool.maxFilesFree} file${tool.maxFilesFree === 1 ? '' : 's'}.`,
        );
        resetPageState();
        setPicked(combined.slice(0, maxFiles));
        return;
      }
      resetPageState();
      setPicked(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file');
    }
  }

  function onRemove(index: number): void {
    resetPageState();
    setPicked((prev) => prev.filter((_, i) => i !== index));
  }

  function resetPageState(): void {
    setPageCount(0);
    setStartPage(1);
    setEndPage(1);
    setThumbs([]);
    setPageOrder([]);
    setRemovedPages([]);
    setPageRotations({});
    setRotateAll(false);
    setReverse(false);
  }

  useEffect(() => {
    if (tool.id !== 'view' || picked.length < tool.minFiles) return;
    const file = picked[0];
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        await saveRecent({ name: file.name, tool: 'view', bytes: file.bytes });
        if (cancelled) return;
        setLastJob(null, null);
        setCurrentViewer(file.bytes, file.name);
        navigate('#/viewer');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not open file');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked, tool.id, tool.minFiles]);

  function extraValid(): boolean {
    switch (tool.id) {
      case 'split':
        return (
          pageCount > 0 &&
          startPage >= 1 &&
          endPage >= startPage &&
          endPage <= pageCount
        );
      case 'watermark':
        return watermarkText.trim().length > 0;
      case 'protect':
        return password.length > 0 && password === confirmPassword;
      case 'organize':
        return pageCount > 0 && removedPages.length < pageCount;
      default:
        return true;
    }
  }

  function buildOps(count: number): OrganizeOp[] {
    const ops: OrganizeOp[] = [];
    const baseOrder =
      pageOrder.length === count
        ? pageOrder
        : Array.from({ length: count }, (_, index) => index);
    const removed = new Set(removedPages);
    const order = baseOrder.filter((pageIndex) => !removed.has(pageIndex));
    ops.push({ type: 'reorder', order });
    order.forEach((originalPageIndex, outputIndex) => {
      const degrees = normalizeQuarterTurn(pageRotations[originalPageIndex] ?? 0);
      if (degrees !== 0) {
        ops.push({ type: 'rotate', pageIndex: outputIndex, degrees });
      }
    });
    return ops;
  }

  function movePage(pageIndex: number, direction: -1 | 1): void {
    const at = pageOrder.indexOf(pageIndex);
    const target = at + direction;
    if (at < 0 || target < 0 || target >= pageOrder.length) return;
    const next = [...pageOrder];
    [next[at], next[target]] = [next[target]!, next[at]!];
    setPageOrder(next);
    setReverse(false);
  }

  function rotatePage(pageIndex: number): void {
    setPageRotations((current) => ({
      ...current,
      [pageIndex]: (current[pageIndex] ?? 0) + 90,
    }));
  }

  function toggleRemoved(pageIndex: number): void {
    setRemovedPages((current) =>
      current.includes(pageIndex)
        ? current.filter((index) => index !== pageIndex)
        : [...current, pageIndex],
    );
  }

  function rotateEveryPage(): void {
    const rotationDelta = rotateAll ? -90 : 90;
    setRotateAll((value) => !value);
    setPageRotations((current) => {
      const next = { ...current };
      for (let index = 0; index < pageCount; index++) {
        next[index] = (next[index] ?? 0) + rotationDelta;
      }
      return next;
    });
  }

  function reversePages(): void {
    setReverse((value) => !value);
    setPageOrder((current) => [...current].reverse());
  }

  async function run(): Promise<void> {
    if (locked) {
      setError('This tool is not available right now.');
      return;
    }
    if (picked.length < tool.minFiles) {
      setError(
        `Need at least ${tool.minFiles} file${tool.minFiles === 1 ? '' : 's'}.`,
      );
      return;
    }
    if (!extraValid()) {
      setError('Fill in the options first.');
      return;
    }
    const first = picked[0];
    if (!first) return;
    setBusy(true);
    setJobProgress(tool.id === 'pdf-docx' ? 0 : undefined);
    setJobLabel(tool.id === 'pdf-docx' ? 'Reading PDF' : 'Working on-device…');
    setError(null);
    try {
      let result: JobResult;
      switch (tool.id) {
        case 'merge':
          result = await engine.merge(picked);
          break;
        case 'split':
          result = await engine.split(first, { start: startPage, end: endPage });
          break;
        case 'images':
        case 'scan':
          result = await engine.imagesToPdf(picked);
          break;
        case 'pdf-images':
          result = await engine.pdfToImages(first);
          break;
        case 'compress':
          result = await engine.compress(first, compressLevel);
          break;
        case 'organize':
          result = await engine.organize(first, buildOps(pageCount));
          break;
        case 'watermark':
          result = await engine.watermark(first, {
            text: watermarkText.trim(),
            opacity: watermarkOpacity,
          });
          break;
        case 'numbers':
          result = await engine.pageNumbers(first);
          break;
        case 'protect':
          result = await engine.protect(first, { userPassword: password });
          break;
        case 'view':
          result = { ok: true, bytes: first.bytes, filename: first.name };
          break;
        case 'docx-pdf':
          result = await engine.docxToPdf(first);
          break;
        case 'pdf-docx':
          result = await engine.pdfToDocx(first, (update: PdfToDocxProgress) => {
            setJobProgress(update.progress);
            setJobLabel(update.label);
          });
          break;
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLastJob(result, tool.id);
      if (result.filename.toLowerCase().endsWith('.pdf')) {
        setCurrentViewer(result.bytes, result.filename);
      }
      navigate('#/result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const canRun =
    !locked &&
    !busy &&
    tool.id !== 'view' &&
    picked.length >= tool.minFiles &&
    extraValid();
  const hasFile = picked.length >= tool.minFiles;
  const flowSteps = TOOLS_WITH_OPTIONS.has(tool.id)
    ? ['Select', 'Adjust', 'Create']
    : ['Select', 'Create'];
  const activeStep =
    picked.length < tool.minFiles
      ? 0
      : busy || flowSteps.length === 2
        ? flowSteps.length - 1
        : 1;

  function blockedReason(): string | null {
    if (locked) return 'This tool is not available right now.';
    if (tool.id === 'view') return null;
    if (picked.length < tool.minFiles) {
      if (tool.id === 'merge') return 'Add at least 2 PDFs to merge.';
      if (tool.id === 'scan') return 'Take or choose a photo first.';
      if (tool.id === 'images') {
        return tool.minFiles === 1
          ? 'Add a photo first.'
          : `Add at least ${tool.minFiles} images.`;
      }
      if (tool.id === 'docx-pdf') return 'Choose a Word file first.';
      return 'Choose a PDF first.';
    }
    if (tool.id === 'split') return extraValid() ? null : 'Set a valid page range.';
    if (tool.id === 'watermark') return watermarkText.trim() ? null : 'Enter watermark text.';
    if (tool.id === 'protect') {
      if (!password) return 'Set a password first.';
      if (password !== confirmPassword) return 'Passwords do not match.';
    }
    if (tool.id === 'organize' && pageCount > 0 && removedPages.length >= pageCount) {
      return 'Restore at least one page before continuing.';
    }
    return null;
  }

  const ctaHint = canRun ? null : blockedReason();

  if (tool.id === 'scan' && cameraOpen) {
    return (
      <ScanCamera
        pages={picked}
        maxPages={scanMaxPages}
        onPages={(next) => {
          setError(null);
          setPicked(next);
        }}
        onClose={() => {
          if (picked.length === 0) goBack('#/');
          else setCameraOpen(false);
        }}
        onUse={() => setCameraOpen(false)}
      />
    );
  }

  return (
    <div className="ps-screen">
      <PageHeader
        title={tool.title}
        subtitle={tool.blurb}
        onBack={() => goBack('#/')}
      />
      <div className="ps-body">
        <div className="ps-steps" aria-label="Tool progress">
          {flowSteps.map((step, index) => (
            <span
              key={step}
              className={`ps-step${index < activeStep ? ' is-complete' : ''}${
                index === activeStep ? ' is-active' : ''
              }`}
              aria-current={index === activeStep ? 'step' : undefined}
            >
              {index + 1}. {step}
            </span>
          ))}
        </div>
        {error ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        {tool.accept !== 'none' && tool.id === 'scan' ? (
          <>
            <AnimatedButton
              variant="ghost"
              icon={Camera}
              block
              onClick={() => setCameraOpen(true)}
            >
              Add page with camera
            </AnimatedButton>
            <FileWell
              accept="image/*"
              multiple
              files={wellItems}
              onPick={(list) => {
                void onPick(list);
              }}
              onRemove={onRemove}
              label={picked.length > 0 ? 'Pages in this scan' : 'Choose from gallery'}
              hint="Photos stay on this device"
            />
          </>
        ) : tool.accept !== 'none' ? (
          <FileWell
            accept={acceptAttr(tool.accept)}
            multiple={multiple}
            files={wellItems}
            onPick={(list) => {
              void onPick(list);
            }}
            onRemove={onRemove}
            label={copy.label}
            hint={copy.hint}
          />
        ) : null}

        {tool.id === 'docx-pdf' ? (
          <p className="ps-note">
            Page margins, blank lines, and space before/after follow the Word
            file. Nested tables and text boxes still will not match. Standard
            fonts: non-Latin letters may become ?.
          </p>
        ) : null}
        {tool.id === 'pdf-docx' ? (
          <p className="ps-note">
            Rebuilds styled text, detected tables, and two-column layouts.
            Scanned pages use bundled English OCR entirely on-device; uncertain
            pages stay as full-page images instead of returning unreliable text.
          </p>
        ) : null}

        {tool.id === 'split' && hasFile ? (
          <>
            <div className="ps-row">
              <label className="ps-field ps-grow">
                Start page
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  value={startPage}
                  onChange={(event) => setStartPage(Number(event.target.value))}
                />
              </label>
              <label className="ps-field ps-grow">
                End page
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  value={endPage}
                  onChange={(event) => setEndPage(Number(event.target.value))}
                />
              </label>
            </div>
            {pageCount > 0 ? (
              <p className="ps-note tabular">{pageCount} pages</p>
            ) : null}
          </>
        ) : null}

        {tool.id === 'compress' && hasFile ? (
          <>
            <div className="ps-row" role="group" aria-label="Compression level">
              {LEVELS.map((level) => (
                <AnimatedButton
                  key={level.id}
                  variant={compressLevel === level.id ? 'brass' : 'ghost'}
                  aria-pressed={compressLevel === level.id}
                  onClick={() => setCompressLevel(level.id)}
                >
                  {level.label}
                </AnimatedButton>
              ))}
            </div>
            <p className="ps-note">
              Compression flattens pages into images. Forms, links, signatures,
              and selectable text are not retained. Ream keeps the original when
              flattening would make the file larger.
            </p>
          </>
        ) : null}

        {tool.id === 'watermark' && hasFile ? (
          <>
            <label className="ps-field">
              Text
              <input
                type="text"
                value={watermarkText}
                onChange={(event) => setWatermarkText(event.target.value)}
                placeholder="CONFIDENTIAL"
              />
            </label>
            <label className="ps-field">
              Opacity {Math.round(watermarkOpacity * 100)}%
              <input
                type="range"
                min={0.08}
                max={0.35}
                step={0.05}
                value={watermarkOpacity}
                onChange={(event) => setWatermarkOpacity(Number(event.target.value))}
              />
            </label>
          </>
        ) : null}

        {tool.id === 'protect' && hasFile ? (
          <>
            <label className="ps-field">
              Password
              <span className="ps-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="ps-password__toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label className="ps-field">
              Confirm password
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {tool.id === 'organize' && hasFile ? (
          <>
            {pageCount > 0 ? (
              <p className="ps-muted tabular">{pageCount} pages</p>
            ) : null}
            {thumbs.length > 0 ? (
              <div className="ps-organize-grid">
                {pageOrder
                  .filter((pageIndex) => pageIndex < thumbs.length)
                  .map((pageIndex) => {
                    const removed = removedPages.includes(pageIndex);
                    const position = pageOrder.indexOf(pageIndex);
                    const rotation = pageRotations[pageIndex] ?? 0;
                    return (
                      <article
                        className={`ps-organize-card${removed ? ' is-removed' : ''}`}
                        key={pageIndex}
                      >
                        <div className="ps-organize-card__header">
                          <span>Page {pageIndex + 1}</span>
                          <span className="tabular">#{position + 1}</span>
                        </div>
                        <div className="ps-organize-preview">
                          <img
                            src={thumbs[pageIndex]}
                            alt={`Page ${pageIndex + 1}`}
                            style={{ transform: `rotate(${rotation}deg)` }}
                          />
                        </div>
                        <div className="ps-organize-controls">
                          <AnimatedButton
                            variant="ghost"
                            disabled={position === 0}
                            aria-label={`Move page ${pageIndex + 1} left`}
                            onClick={() => movePage(pageIndex, -1)}
                          >
                            Left
                          </AnimatedButton>
                          <AnimatedButton
                            variant="ghost"
                            disabled={position === pageOrder.length - 1}
                            aria-label={`Move page ${pageIndex + 1} right`}
                            onClick={() => movePage(pageIndex, 1)}
                          >
                            Right
                          </AnimatedButton>
                          <AnimatedButton
                            variant="ghost"
                            aria-label={`Rotate page ${pageIndex + 1} clockwise`}
                            onClick={() => rotatePage(pageIndex)}
                          >
                            Rotate
                          </AnimatedButton>
                          <AnimatedButton
                            variant={removed ? 'brass' : 'danger'}
                            aria-label={`${removed ? 'Restore' : 'Remove'} page ${pageIndex + 1}`}
                            onClick={() => toggleRemoved(pageIndex)}
                          >
                            {removed ? 'Restore' : 'Remove'}
                          </AnimatedButton>
                        </div>
                      </article>
                    );
                  })}
              </div>
            ) : null}
            {pageCount > 30 ? (
              <p className="ps-note">
                Showing previews for the first 30 source pages. Bulk actions apply
                to all {pageCount} pages.
              </p>
            ) : null}
            {removedPages.length === pageCount && pageCount > 0 ? (
              <p className="ps-banner ps-banner--error" role="alert">
                Restore at least one page before running.
              </p>
            ) : null}
            <div className="ps-row" role="group" aria-label="Bulk page adjustments">
              <AnimatedButton
                variant={rotateAll ? 'brass' : 'ghost'}
                aria-pressed={rotateAll}
                disabled={pageCount === 0}
                onClick={rotateEveryPage}
              >
                Rotate all 90°
              </AnimatedButton>
              <AnimatedButton
                variant={reverse ? 'brass' : 'ghost'}
                aria-pressed={reverse}
                disabled={pageCount === 0}
                onClick={reversePages}
              >
                Reverse order
              </AnimatedButton>
            </div>
          </>
        ) : null}

        {tool.id !== 'view' ? (
          <div className="ps-actions ps-actions--sticky">
            {ctaHint ? (
              <p className="ps-cta-hint" role="status">
                {ctaHint}
              </p>
            ) : null}
            <AnimatedButton block disabled={!canRun} onClick={() => void run()}>
              {ACTION_LABELS[tool.id as Exclude<ToolId, 'view'>]}
            </AnimatedButton>
          </div>
        ) : (
          <p className="ps-note">Pick a file to open it here.</p>
        )}
      </div>
      <ProgressHud
        open={busy}
        label={jobLabel}
        progress={jobProgress}
      />
    </div>
  );
}

function normalizeQuarterTurn(degrees: number): 0 | 90 | 180 | 270 {
  return (((degrees % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}
