import { useEffect, useMemo, useState } from 'react';
import { AnimatedButton, FileWell, PageHeader, ProgressHud } from '../components';
import { TOOLS, type ToolDef } from '../lib/catalog';
import type {
  CompressLevel,
  JobResult,
  OrganizeOp,
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
import { navigate } from './nav';

type ToolFlowProps = {
  id: ToolId;
};

const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<
  ToolId,
  ToolDef
>;

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: 'strong', label: 'Strong' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'keep', label: 'Keep' },
];

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
      return { label: 'Choose a PDF', hint: 'Extracts text into Word' };
    default:
      return { label: 'Choose a PDF', hint: 'Stays on this device' };
  }
}

export function ToolFlow({ id }: ToolFlowProps) {
  const tool = TOOL_BY_ID[id];
  const pro = usePro();
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [compressLevel, setCompressLevel] = useState<CompressLevel>('balanced');
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.28);
  const [password, setPassword] = useState('');
  const [rotateAll, setRotateAll] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);

  const locked = !pro && tool.pro;
  const maxFiles = pro ? Number.POSITIVE_INFINITY : tool.maxFilesFree;
  const multiple = tool.accept === 'pdfs' || tool.accept === 'images';
  const copy = wellCopy(tool.id, tool.minFiles);
  const wellItems = useMemo(
    () => picked.map((file) => ({ name: file.name, size: file.bytes.byteLength })),
    [picked],
  );

  useEffect(() => {
    const file = picked[0];
    if (!file || (tool.id !== 'split' && tool.id !== 'organize')) {
      setPageCount(0);
      return;
    }
    let cancelled = false;
    void engine
      .pageCount(file)
      .then((count) => {
        if (cancelled) return;
        setPageCount(count);
        setStartPage(1);
        setEndPage(Math.max(1, count));
      })
      .catch(() => {
        if (!cancelled) setPageCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [picked, tool.id]);

  useEffect(() => {
    if (tool.id !== 'organize' || !picked[0] || pageCount < 1) {
      setThumbs([]);
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    const file = picked[0];
    void (async () => {
      const n = Math.min(pageCount, 8);
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
        setPicked(combined.slice(0, maxFiles));
        return;
      }
      setPicked(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read file');
    }
  }

  function onRemove(index: number): void {
    setPicked((prev) => prev.filter((_, i) => i !== index));
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
        return startPage >= 1 && endPage >= startPage;
      case 'watermark':
        return watermarkText.trim().length > 0;
      case 'protect':
        return password.length > 0;
      default:
        return true;
    }
  }

  function buildOps(count: number): OrganizeOp[] {
    const ops: OrganizeOp[] = [];
    if (rotateAll) {
      for (let i = 0; i < count; i++) {
        ops.push({ type: 'rotate', pageIndex: i, degrees: 90 });
      }
    }
    if (reverse && count > 0) {
      ops.push({
        type: 'reorder',
        order: Array.from({ length: count }, (_, i) => count - 1 - i),
      });
    }
    return ops;
  }

  async function run(): Promise<void> {
    if (locked) {
      setError('Pro is off (dev toggle)');
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
          result = await engine.pdfToDocx(first);
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

  return (
    <div className="ps-screen">
      <PageHeader
        title={tool.title}
        subtitle={tool.blurb}
        onBack={() => navigate('#/')}
      />
      <div className="ps-body">
        {locked ? (
          <p className="ps-banner ps-banner--lock" role="status">
            Pro is off (dev toggle)
          </p>
        ) : null}
        {error ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        {tool.accept !== 'none' && tool.id === 'scan' ? (
          <>
            <FileWell
              accept="image/*"
              multiple
              files={[]}
              onPick={(list) => {
                void onPick(list);
              }}
              label="Take a photo"
              hint="Uses the rear camera"
              capture="environment"
            />
            <FileWell
              accept="image/*"
              multiple
              files={wellItems}
              onPick={(list) => {
                void onPick(list);
              }}
              onRemove={onRemove}
              label="Choose from gallery"
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
            Rebuilds text, detected tables, and two-column layouts. Pages with
            almost no text (scans) are inserted as page images. Not a perfect
            copy of every PDF design.
          </p>
        ) : null}

        {tool.id === 'split' ? (
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

        {tool.id === 'compress' ? (
          <div className="ps-row">
            {LEVELS.map((level) => (
              <AnimatedButton
                key={level.id}
                variant={compressLevel === level.id ? 'brass' : 'ghost'}
                onClick={() => setCompressLevel(level.id)}
              >
                {level.label}
              </AnimatedButton>
            ))}
          </div>
        ) : null}

        {tool.id === 'watermark' ? (
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
                min={0.05}
                max={1}
                step={0.05}
                value={watermarkOpacity}
                onChange={(event) => setWatermarkOpacity(Number(event.target.value))}
              />
            </label>
          </>
        ) : null}

        {tool.id === 'protect' ? (
          <>
            <p className="ps-banner ps-banner--lock" role="status">
              Password lock is not in this engine yet. pdf-lib cannot encrypt
              files. Run still explains this if you try.
            </p>
            <label className="ps-field">
              Password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {tool.id === 'organize' ? (
          <>
            {pageCount > 0 ? (
              <p className="ps-muted tabular">{pageCount} pages</p>
            ) : null}
            {thumbs.length > 0 ? (
              <div className="ps-thumbs">
                {thumbs.map((url, index) => (
                  <img key={url} src={url} alt={`Page ${index + 1}`} />
                ))}
              </div>
            ) : null}
            <div className="ps-row">
              <AnimatedButton
                variant={rotateAll ? 'brass' : 'ghost'}
                onClick={() => setRotateAll((v) => !v)}
              >
                Rotate all 90°
              </AnimatedButton>
              <AnimatedButton
                variant={reverse ? 'brass' : 'ghost'}
                onClick={() => setReverse((v) => !v)}
              >
                Reverse order
              </AnimatedButton>
            </div>
          </>
        ) : null}

        {tool.id !== 'view' ? (
          <div className="ps-actions">
            <AnimatedButton block disabled={!canRun} onClick={() => void run()}>
              Run
            </AnimatedButton>
          </div>
        ) : (
          <p className="ps-note">Pick a file to open it here.</p>
        )}
      </div>
      <ProgressHud open={busy} label="Working on-device…" />
    </div>
  );
}
