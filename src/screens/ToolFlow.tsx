import { PAPER_SIZES } from "../lib/paperSizes";
import { useEffect, useMemo, useState, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  AnimatedButton,
  FileWell,
  PageHeader,
  ProgressHud,
  SelectField,
} from "../components";
import { ScanCamera } from "./ScanCamera";
import { ScanEditor } from "./ScanEditor";
import { ScanPdfPreview } from "./ScanPdfPreview";
import { TOOLS, type ToolDef } from "../lib/catalog";
import type {
  CompressLevel,
  JobResult,
  OrganizeOp,
  PdfToDocxProgress,
  PickedFile,
  ToolId,
  ImagePdfOptions,
  PageNumberOptions,
} from "../lib/types";
import { engine, cancelPendingJobs } from "../pdf";
import { parsePages } from "../pdf/pageSelection";
import { takeToolFiles } from "../store/toolInput";
import { usePro } from "../store/entitlements";
import { fileListToPicked, MAX_INPUT_BYTES, saveBytes, shareOrDownload } from "../store/files";
import { setCurrentViewer, setLastJob } from "../store/lastJob";
import { saveRecent } from "../store/recents";
import { takePendingScan, takePendingScanError } from "../store/pendingScan";
import { goBack, navigate } from "./nav";

type ToolFlowProps = {
  id: ToolId;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultScanPdfName(at = new Date()): string {
  return `pdf_${pad2(at.getDate())}${pad2(at.getMonth() + 1)}${pad2(at.getFullYear() % 100)}_${pad2(at.getHours())}${pad2(at.getMinutes())}`;
}

const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<
  ToolId,
  ToolDef
>;

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: "keep", label: "Preserve text" },
  { id: "balanced", label: "Smaller scan" },
  { id: "strong", label: "Smallest scan" },
];

const TOOLS_WITH_OPTIONS = new Set<ToolId>([
  "split",
  "compress",
  "organize",
  "watermark",
  "protect",
  "scan",
  "images",
  "pdf-images",
  "numbers",
]);

const ACTION_LABELS: Record<Exclude<ToolId, "view">, string> = {
  merge: "Merge PDFs",
  split: "Extract pages",
  images: "Create PDF",
  "pdf-images": "Export images",
  compress: "Compress PDF",
  scan: "Create scanned PDF",
  organize: "Apply page changes",
  watermark: "Add watermark",
  numbers: "Add page numbers",
  protect: "Protect PDF",
  "docx-pdf": "Convert to PDF",
  "pdf-docx": "Convert to Word",
};

function acceptAttr(accept: ToolDef["accept"]): string {
  if (accept === "images") return "image/*";
  if (accept === "docx") {
    return ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/pdf";
}

function wellCopy(
  id: ToolId,
  minFiles: number,
): { label: string; hint: string } {
  switch (id) {
    case "merge":
      return { label: "Add PDFs", hint: `At least ${minFiles} files` };
    case "images":
      return { label: "Add images", hint: "JPG, PNG, or WebP" };
    case "scan":
      return { label: "Add pages", hint: "Camera or gallery" };
    case "view":
      return { label: "Open a PDF", hint: "Stays on this device" };
    case "docx-pdf":
      return {
        label: "Choose a Word file",
        hint: "DOCX only. Layout is simplified.",
      };
    case "pdf-docx":
      return { label: "Choose a PDF", hint: "Rebuilds text into Word" };
    default:
      return { label: "Choose a PDF", hint: "Stays on this device" };
  }
}

function takeInitialScan(id: ToolId): {
  files: PickedFile[];
  error: string | null;
} {
  const queued = takeToolFiles(id);
  if (queued.length || id !== "scan") return { files: queued, error: null };
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
    () => id === "scan" && initialScan.files.length === 0,
  );
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStep, setScanStep] = useState<"edit" | "pdf">("edit");
  const [scanName, setScanName] = useState(defaultScanPdfName);
  const scanNameEdited = useRef(false);

  const [jobProgress, setJobProgress] = useState<number | undefined>();
  const [jobLabel, setJobLabel] = useState("Working on-device…");
  const [error, setError] = useState<string | null>(initialScan.error);
  const [pageCount, setPageCount] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [compressLevel, setCompressLevel] = useState<CompressLevel>("keep");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.28);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rotateAll, setRotateAll] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [removedPages, setRemovedPages] = useState<number[]>([]);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>(
    {},
  );
  const [selection, setSelection] = useState("");
  const [imageFormat, setImageFormat] = useState<"jpeg" | "png">("jpeg");
  const [imageScale, setImageScale] = useState(2);
  const [imageOptions, setImageOptions] = useState<ImagePdfOptions>({
    size: "a4",
    landscape: false,
    margin: 0,
  });
  const [numberOptions, setNumberOptions] = useState<PageNumberOptions>({
    start: 1,
    position: "center",
    total: true,
  });
  const [watermarkAngle, setWatermarkAngle] = useState(-35);
  const [organizeOffset, setOrganizeOffset] = useState(0);
  const jobController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (jobController.current) {
        jobController.current.abort();
        cancelPendingJobs();
      }
    };
  }, []);
  function cancelJob() {
    jobController.current?.abort();
    cancelPendingJobs();
    setJobLabel("Cancelling…");
  }
  function moveFile(index: number, direction: -1 | 1) {
    setPicked((files) => {
      const next = [...files];
      const to = index + direction;
      if (to < 0 || to >= next.length) return files;
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  }

  const locked = !pro && tool.pro;
  const maxFiles = pro ? Number.POSITIVE_INFINITY : tool.maxFilesFree;
  const scanMaxPages = Number.isFinite(maxFiles) ? Math.max(1, maxFiles) : 20;
  const multiple = tool.accept === "pdfs" || tool.accept === "images";
  const copy = wellCopy(tool.id, tool.minFiles);
  const wellItems = useMemo(
    () =>
      picked.map((file) => ({ name: file.name, size: file.bytes.byteLength })),
    [picked],
  );

  useEffect(() => {
    const file = picked[0];
    if (!file || !["split", "organize", "pdf-images"].includes(tool.id)) return;
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
      .catch((error) => {
        if (!cancelled) {
          setPageCount(0);
          setError(
            error instanceof Error ? error.message : "Could not read this PDF.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [picked, tool.id]);

  useEffect(() => {
    if (tool.id !== "organize" || !picked[0] || pageCount < 1) return;
    let cancelled = false;
    const controller = new AbortController();
    const urls: string[] = [];
    let session: Awaited<ReturnType<typeof engine.openViewer>> | undefined;
    void (async () => {
      try {
        session = await engine.openViewer(picked[0]!, undefined, {
          signal: controller.signal,
          indexText: false,
        });
        for (const i of pageOrder.slice(organizeOffset, organizeOffset + 30)) {
          if (cancelled) return;
          const blob = await session.renderPage(i, 150);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setThumbs((current) => {
            const next = [...current];
            next[i] = url;
            return next;
          });
        }
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error ? error.message : "Could not load previews.",
          );
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (session) void session.destroy();
      urls.forEach((url) => URL.revokeObjectURL(url));
      setThumbs([]);
    };
  }, [tool.id, picked, pageCount, organizeOffset, pageOrder]);

  async function onPick(fileList: FileList): Promise<void> {
    setError(null);
    try {
      const incoming = await fileListToPicked(
        fileList,
        tool.accept === "images",
      );
      const combined = multiple ? [...picked, ...incoming] : incoming;
      if (
        combined.length > 200 ||
        combined.reduce((sum, file) => sum + file.bytes.length, 0) >
          MAX_INPUT_BYTES
      )
        throw new Error(
          "This job exceeds 200 files or 128 MB. Remove some files before adding more.",
        );
      if (Number.isFinite(maxFiles) && combined.length > maxFiles) {
        setError(
          `Free limit is ${tool.maxFilesFree} file${tool.maxFilesFree === 1 ? "" : "s"}.`,
        );
        resetPageState();
        setPicked(combined.slice(0, maxFiles));
        return;
      }
      resetPageState();
      setPicked(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file");
    }
  }

  function onRemove(index: number): void {
    resetPageState();
    setPicked((prev) => prev.filter((_, i) => i !== index));
  }

  function resetPageState(): void {
    setPageCount(0);
    setOrganizeOffset(0);
    setSelection("");
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
    if (tool.id !== "view" || picked.length < tool.minFiles) return;
    const file = picked[0];
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        await saveRecent({
          name: file.name,
          tool: "view",
          bytes: file.bytes,
        }).catch(() => undefined);
        if (cancelled) return;
        setLastJob(null, null);
        setCurrentViewer(file.bytes, file.name);
        navigate("#/viewer");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open file");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picked, tool.id, tool.minFiles]);

  function extraValid(): boolean {
    switch (tool.id) {
      case "pdf-images":
        try {
          const pages = parsePages(selection, pageCount);
          return pages.length > 0 && pages.length <= 200;
        } catch {
          return false;
        }
      case "split":
        if (selection.trim()) {
          try {
            return parsePages(selection, pageCount).length > 0;
          } catch {
            return false;
          }
        }
        return (
          pageCount > 0 &&
          startPage >= 1 &&
          endPage >= startPage &&
          endPage <= pageCount
        );
      case "watermark":
        return watermarkText.trim().length > 0;
      case "protect":
        return password.trim().length > 0 && password === confirmPassword;
      case "organize":
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
    ops.push({ type: "reorder", order });
    order.forEach((originalPageIndex, outputIndex) => {
      const degrees = normalizeQuarterTurn(
        pageRotations[originalPageIndex] ?? 0,
      );
      if (degrees !== 0) {
        ops.push({ type: "rotate", pageIndex: outputIndex, degrees });
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

  async function run(exportAction?: "save" | "share"): Promise<void> {
    if (jobController.current || scanBusy) return;
    if (locked) {
      setError("This tool is not available right now.");
      return;
    }
    if (picked.length < tool.minFiles) {
      setError(
        `Need at least ${tool.minFiles} file${tool.minFiles === 1 ? "" : "s"}.`,
      );
      return;
    }
    if (!extraValid()) {
      setError("Fill in the options first.");
      return;
    }
    const first = picked[0];
    if (!first) return;
    const controller = new AbortController();
    jobController.current = controller;
    const control = {
      signal: controller.signal,
      onProgress: (update: PdfToDocxProgress) => {
        if (!controller.signal.aborted && mounted.current) {
          setJobProgress(update.progress);
          setJobLabel(update.label);
        }
      },
    };
    setBusy(true);
    setJobProgress(tool.id === "pdf-docx" ? 0 : undefined);
    setJobLabel(tool.id === "pdf-docx" ? "Reading PDF" : "Working on-device…");
    setError(null);
    try {
      let result: JobResult;
      switch (tool.id) {
        case "merge":
          result = await engine.merge(picked);
          break;
        case "split":
          result = await engine.split(first, {
            start: startPage,
            end: endPage,
            pages: selection.trim()
              ? parsePages(selection, pageCount)
              : undefined,
          });
          break;
        case "images":
        case "scan":
          result = await engine.imagesToPdf(picked, imageOptions);
          break;
        case "pdf-images":
          result = await engine.pdfToImages(
            first,
            {
              pages: parsePages(selection, pageCount),
              scale: imageScale,
              format: imageFormat,
            },
            control,
          );
          break;
        case "compress":
          result = await engine.compress(first, compressLevel, control);
          break;
        case "organize":
          result = await engine.organize(first, buildOps(pageCount));
          break;
        case "watermark":
          result = await engine.watermark(first, {
            text: watermarkText.trim(),
            opacity: watermarkOpacity,
            angle: watermarkAngle,
          });
          break;
        case "numbers":
          result = await engine.pageNumbers(first, numberOptions);
          break;
        case "protect":
          result = await engine.protect(first, { userPassword: password });
          break;
        case "view":
          result = { ok: true, bytes: first.bytes, filename: first.name };
          break;
        case "docx-pdf":
          result = await engine.docxToPdf(first);
          break;
        case "pdf-docx":
          result = await engine.pdfToDocx(
            first,
            control.onProgress,
            controller.signal,
          );
          break;
      }
      if (controller.signal.aborted || !mounted.current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (tool.id === "scan") result.filename = (scanName.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "") || defaultScanPdfName()) + ".pdf";
      setLastJob(result, tool.id);
      if (result.filename.toLowerCase().endsWith(".pdf")) {
        setCurrentViewer(result.bytes, result.filename);
      }
      if (tool.id === "scan" && exportAction) {
        const exported = exportAction === "save"
          ? await saveBytes(result.bytes, result.filename, "application/pdf")
          : await shareOrDownload(result.bytes, result.filename, "application/pdf");
        if (exported.status === "cancelled") return;
      }
      navigate("#/result");
    } catch (err) {
      if (mounted.current && !controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (mounted.current) {
        setBusy(false);
        if (controller.signal.aborted)
          setError(
            "Processing cancelled. Your selected files are ready to try again.",
          );
      }
      jobController.current = null;
    }
  }

  const canRun =
    !locked &&
    !busy &&
    !scanBusy &&
    tool.id !== "view" &&
    picked.length >= tool.minFiles &&
    extraValid();
  const hasFile = picked.length >= tool.minFiles;
  const flowSteps = tool.id === "scan" ? ["Edit pages", "PDF & export"] : TOOLS_WITH_OPTIONS.has(tool.id)
    ? ["Select", "Adjust", "Create"]
    : ["Select", "Create"];
  const activeStep = tool.id === "scan" ? (scanStep === "edit" ? 0 : 1) :
    picked.length < tool.minFiles
      ? 0
      : busy || flowSteps.length === 2
        ? flowSteps.length - 1
        : 1;

  function blockedReason(): string | null {
    if (scanBusy) return "Finish or cancel the page adjustment first.";
    if (locked) return "This tool is not available right now.";
    if (tool.id === "view") return null;
    if (picked.length < tool.minFiles) {
      if (tool.id === "merge") return "Add at least 2 PDFs to merge.";
      if (tool.id === "scan") return "Take or choose a photo first.";
      if (tool.id === "images") {
        return tool.minFiles === 1
          ? "Add a photo first."
          : `Add at least ${tool.minFiles} images.`;
      }
      if (tool.id === "docx-pdf") return "Choose a Word file first.";
      return "Choose a PDF first.";
    }
    if (tool.id === "split" || tool.id === "pdf-images")
      return extraValid()
        ? null
        : "Choose valid pages (up to 200 for image export).";
    if (tool.id === "watermark")
      return watermarkText.trim() ? null : "Enter watermark text.";
    if (tool.id === "protect") {
      if (!password) return "Set a password first.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }
    if (
      tool.id === "organize" &&
      pageCount > 0 &&
      removedPages.length >= pageCount
    ) {
      return "Restore at least one page before continuing.";
    }
    return null;
  }

  const ctaHint = canRun ? null : blockedReason();
  const scanPdf = tool.id === "scan" && scanStep === "pdf";

  const scanCamera = tool.id === "scan" && cameraOpen ? (
      <ScanCamera
        pages={picked}
        maxPages={scanMaxPages}
        onPages={(next) => {
          setError(null);
          setPicked(next);
          setCameraOpen(false);
          setScanStep("edit");
        }}
        onClose={() => {
          if (picked.length === 0) goBack("#/");
          else setCameraOpen(false);
        }}
        onUse={() => setCameraOpen(false)}
      />
    ) : null;

  return (
    <>
    {scanCamera}
    <div
      style={tool.id === "scan" && cameraOpen ? {display: "none"} : undefined}
      className={`ps-screen${tool.id === "scan" && scanStep === "edit" ? " ps-screen--scan-edit" : ""}${scanPdf ? " ps-screen--scan-pdf" : ""}`}
    >
      {tool.id !== "scan" || scanStep !== "edit" ? <PageHeader
        title={scanPdf ? "Save" : tool.title}
        subtitle={
          scanPdf
            ? "Name the PDF and choose the page, then save or share."
            : tool.blurb
        }
        backLabel={scanPdf ? "Back to page editing" : "Back"}
        onBack={scanPdf ? () => setScanStep("edit") : () => goBack("#/")}
      /> : null}
      <div className="ps-body">
        {tool.id !== "scan" ? <div className="ps-steps" aria-label="Tool progress">
          {flowSteps.map((step, index) => (
            <span
              key={step}
              className={`ps-step${index < activeStep ? " is-complete" : ""}${
                index === activeStep ? " is-active" : ""
              }`}
              aria-current={index === activeStep ? "step" : undefined}
            >
              {index + 1}. {step}
            </span>
          ))}
        </div> : null}
        {error ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        {scanPdf ? (
          <div className="ps-scan-pdf">
            <ScanPdfPreview files={picked} options={imageOptions} />
            <label className="ps-field">PDF name<input value={scanName} maxLength={120} onChange={(e) => { scanNameEdited.current = true; setScanName(e.target.value); }} /></label>
          </div>
        ) : null}
        {tool.accept !== "none" && tool.id !== "scan" ? (
          <FileWell
            accept={acceptAttr(tool.accept)}
            multiple={multiple}
            files={wellItems}
            onPick={(list) => {
              void onPick(list);
            }}
            onRemove={onRemove}
            onMove={multiple ? moveFile : undefined}
            label={copy.label}
            hint={copy.hint}
          />
        ) : null}

        {tool.id === "docx-pdf" ? (
          <p className="ps-note">
            Page margins, blank lines, and space before/after follow the Word
            file. Nested tables and text boxes still will not match. Bundled
            fonts preserve Latin, Greek and Cyrillic text. Files with
            unsupported characters are rejected instead of changing the text.
          </p>
        ) : null}
        {tool.id === "pdf-docx" ? (
          <p className="ps-note">
            Rebuilds styled text, detected tables, and two-column layouts.
            Scanned pages use bundled English OCR entirely on-device; uncertain
            pages stay as full-page images instead of returning unreliable text.
          </p>
        ) : null}

        {tool.id === "scan" && picked.length > 0 ? (
          <div hidden={scanStep !== "edit"} className="ps-scan-review">
          <ScanEditor
            onDone={() => {
              if (!scanNameEdited.current) setScanName(defaultScanPdfName());
              setScanStep("pdf");
              window.scrollTo(0, 0);
            }}
            onCamera={() => setCameraOpen(true)}
            onGallery={(list) => { void onPick(list); }}
            files={picked}
            onBusyChange={setScanBusy}
            onChange={(original, file) =>
              setPicked((files) =>
                files.map((item) => (item === original ? file : item)),
              )
            }
          />
          </div>
        ) : null}
        {["split", "pdf-images"].includes(tool.id) && hasFile ? (
          <label className="ps-field">
            Pages (optional)
            <input
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              placeholder="For example: 1-3, 5, 8-10"
            />
            <span className="ps-note">
              {pageCount || "Reading"} pages. Leave blank to use{" "}
              {tool.id === "split"
                ? "the range below"
                : "all pages (up to 200)"}
              .
            </span>
          </label>
        ) : null}
        {tool.id === "split" && hasFile && !selection.trim() ? (
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

        {tool.id === "compress" && hasFile ? (
          <>
            <div className="ps-row" role="group" aria-label="Compression level">
              {LEVELS.map((level) => (
                <AnimatedButton
                  key={level.id}
                  variant={compressLevel === level.id ? "brass" : "ghost"}
                  aria-pressed={compressLevel === level.id}
                  onClick={() => setCompressLevel(level.id)}
                >
                  {level.label}
                </AnimatedButton>
              ))}
            </div>
            <p className="ps-note">
              {compressLevel === "keep"
                ? "Optimizes PDF structure while keeping text, links and forms. Signed documents are returned unchanged. Some PDFs are already optimized."
                : "For scanned pages: rebuilds pages as images. Selectable text, links, forms and digital signatures are lost. Balanced scans use 144 DPI; smallest scans use about 86 DPI."}{" "}
              Ream keeps the original if it is smaller.
            </p>
          </>
        ) : null}

        {(tool.id === "images" || (tool.id === "scan" && scanStep === "pdf")) && hasFile ? (
          <div className="ps-row ps-scan-pdf-options">
            <SelectField
              label="Page size"
              grow
              value={imageOptions.size}
              options={[
                ...Object.entries(PAPER_SIZES).map(([size, paper]) => ({
                  value: size,
                  label: paper.label,
                })),
                { value: "original", label: "Fit image" },
              ]}
              onChange={(value) =>
                setImageOptions({
                  ...imageOptions,
                  size: value as ImagePdfOptions["size"],
                })
              }
            />
            <SelectField
              label="Orientation"
              grow
              value={String(imageOptions.landscape)}
              disabled={imageOptions.size === "original"}
              options={[
                { value: "false", label: "Portrait" },
                { value: "true", label: "Landscape" },
              ]}
              onChange={(value) =>
                setImageOptions({
                  ...imageOptions,
                  landscape: value === "true",
                })
              }
            />
            <SelectField
              label="Margin"
              value={String(imageOptions.margin)}
              options={[
                { value: "0", label: "None" },
                { value: "12", label: "Narrow" },
                { value: "24", label: "Standard" },
              ]}
              onChange={(value) =>
                setImageOptions({
                  ...imageOptions,
                  margin: Number(value),
                })
              }
            />
          </div>
        ) : null}
        {tool.id === "pdf-images" && hasFile ? (
          <div className="ps-row">
            <label className="ps-field ps-grow">
              Format
              <select
                value={imageFormat}
                onChange={(e) =>
                  setImageFormat(e.target.value as "jpeg" | "png")
                }
              >
                <option value="jpeg">JPEG — smaller files</option>
                <option value="png">PNG — lossless images</option>
              </select>
            </label>
            <label className="ps-field ps-grow">
              Resolution
              <select
                value={imageScale}
                onChange={(e) => setImageScale(Number(e.target.value))}
              >
                <option value={1}>72 DPI — screen</option>
                <option value={2}>144 DPI — balanced</option>
                <option value={3}>216 DPI — detailed</option>
              </select>
            </label>
            <p className="ps-note">
              Multiple pages are saved as one ZIP. Large pages are capped at 12
              megapixels to protect device memory.
            </p>
          </div>
        ) : null}
        {tool.id === "numbers" && hasFile ? (
          <div className="ps-row">
            <label className="ps-field">
              Start at
              <input
                type="number"
                min={1}
                max={99999}
                value={numberOptions.start}
                onChange={(e) =>
                  setNumberOptions({
                    ...numberOptions,
                    start: Math.max(
                      1,
                      Math.min(99999, Number(e.target.value) || 1),
                    ),
                  })
                }
              />
            </label>
            <label className="ps-field">
              Position
              <select
                value={numberOptions.position}
                onChange={(e) =>
                  setNumberOptions({
                    ...numberOptions,
                    position: e.target.value as PageNumberOptions["position"],
                  })
                }
              >
                <option value="left">Bottom left</option>
                <option value="center">Bottom center</option>
                <option value="right">Bottom right</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={numberOptions.total}
                onChange={(e) =>
                  setNumberOptions({
                    ...numberOptions,
                    total: e.target.checked,
                  })
                }
              />{" "}
              Include total
            </label>
          </div>
        ) : null}
        {tool.id === "watermark" && hasFile ? (
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
              Angle
              <select
                value={watermarkAngle}
                onChange={(e) => setWatermarkAngle(Number(e.target.value))}
              >
                <option value={-35}>Diagonal</option>
                <option value={0}>Horizontal</option>
                <option value={35}>Reverse diagonal</option>
              </select>
            </label>
            <label className="ps-field">
              Opacity {Math.round(watermarkOpacity * 100)}%
              <input
                type="range"
                min={0.08}
                max={0.35}
                step={0.05}
                value={watermarkOpacity}
                onChange={(event) =>
                  setWatermarkOpacity(Number(event.target.value))
                }
              />
            </label>
          </>
        ) : null}

        {tool.id === "protect" && hasFile ? (
          <>
            <label className="ps-field">
              Password
              <span className="ps-password">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="ps-password__toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label className="ps-field">
              Confirm password
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {tool.id === "organize" && hasFile ? (
          <>
            {pageCount > 0 ? (
              <p className="ps-muted tabular">{pageCount} pages</p>
            ) : null}
            {thumbs.length > 0 ? (
              <div className="ps-organize-grid">
                {pageOrder
                  .slice(organizeOffset, organizeOffset + 30)
                  .map((pageIndex) => {
                    const removed = removedPages.includes(pageIndex);
                    const position = pageOrder.indexOf(pageIndex);
                    const rotation = pageRotations[pageIndex] ?? 0;
                    return (
                      <article
                        className={`ps-organize-card${removed ? " is-removed" : ""}`}
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
                            variant={removed ? "brass" : "danger"}
                            aria-label={`${removed ? "Restore" : "Remove"} page ${pageIndex + 1}`}
                            onClick={() => toggleRemoved(pageIndex)}
                          >
                            {removed ? "Restore" : "Remove"}
                          </AnimatedButton>
                        </div>
                      </article>
                    );
                  })}
              </div>
            ) : null}
            {pageCount > 30 ? (
              <p className="ps-note">
                Pages {organizeOffset + 1}–
                {Math.min(pageCount, organizeOffset + 30)} of {pageCount}. Bulk
                actions apply to every page.
              </p>
            ) : null}
            {pageCount > 30 ? (
              <div className="ps-row">
                <AnimatedButton
                  variant="ghost"
                  disabled={organizeOffset === 0}
                  onClick={() =>
                    setOrganizeOffset((value) => Math.max(0, value - 30))
                  }
                >
                  Previous pages
                </AnimatedButton>
                <AnimatedButton
                  variant="ghost"
                  disabled={organizeOffset + 30 >= pageCount}
                  onClick={() => setOrganizeOffset((value) => value + 30)}
                >
                  Next pages
                </AnimatedButton>
              </div>
            ) : null}
            {removedPages.length === pageCount && pageCount > 0 ? (
              <p className="ps-banner ps-banner--error" role="alert">
                Restore at least one page before running.
              </p>
            ) : null}
            <div
              className="ps-row"
              role="group"
              aria-label="Bulk page adjustments"
            >
              <AnimatedButton
                variant={rotateAll ? "brass" : "ghost"}
                aria-pressed={rotateAll}
                disabled={pageCount === 0}
                onClick={rotateEveryPage}
              >
                Rotate all 90°
              </AnimatedButton>
              <AnimatedButton
                variant={reverse ? "brass" : "ghost"}
                aria-pressed={reverse}
                disabled={pageCount === 0}
                onClick={reversePages}
              >
                Reverse order
              </AnimatedButton>
            </div>
          </>
        ) : null}

        {tool.id === "scan" && scanStep === "edit" ? null : tool.id !== "view" ? (
          <div className={`ps-actions${tool.id === "scan" ? " ps-actions--row ps-actions--follow" : " ps-actions--sticky"}`}>
            {ctaHint ? (
              <p className="ps-cta-hint" role="status">
                {ctaHint}
              </p>
            ) : null}
            {tool.id === "scan" ? <>
              <AnimatedButton disabled={!canRun} onClick={() => void run("save")}>Save PDF</AnimatedButton>
              <AnimatedButton variant="ghost" disabled={!canRun} onClick={() => void run("share")}>Share PDF</AnimatedButton>
            </> : <AnimatedButton block disabled={!canRun} onClick={() => void run()}>
              {ACTION_LABELS[tool.id as Exclude<ToolId, "view">]}
            </AnimatedButton>}
          </div>
        ) : (
          <p className="ps-note">Pick a file to open it here.</p>
        )}
      </div>
      <ProgressHud
        open={busy}
        label={jobLabel}
        progress={jobProgress}
        onCancel={cancelJob}
      />
    </div>
    </>
  );
}

function normalizeQuarterTurn(degrees: number): 0 | 90 | 180 | 270 {
  return (((degrees % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}
