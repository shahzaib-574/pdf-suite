import { PAPER_SIZES } from "../lib/paperSizes";
import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
import { Eye, EyeOff, Undo2 } from "lucide-react";
import { createPortal } from 'react-dom';
import {
  AnimatedButton,
  FileWell,
  PageHeader,
  ProgressHud,
  SelectField,
} from "../components";
import { movedOrder } from "../components/useDragReorder";
import { ActionSlotsContext } from "../components/actionSlots";
import { showToast } from "../components/Toast";
import { ScanCamera, type NativeScanAdapter } from "./ScanCamera";
import { OCR_LANGUAGES, type OcrLanguage } from '../lib/ocrLanguages';
import { loadScanDraft, saveScanDraft, clearScanDraft, type ScanPageDraft } from '../store/scanDraft';
import { ScanEditor } from "./ScanEditor";
import { OrganizeGrid } from "./OrganizeGrid";
import { prepareOrganizeInput } from "../store/organizeInput";
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
import { fileListToPicked, fileListToScanImages, MAX_INPUT_BYTES, saveBytes, shareOrDownload } from "../store/files";
import { assertScanBudget, retainedScanBytes, replaceScanPage } from '../store/scanInputPolicy';
import { setCurrentViewer, setLastJob } from "../store/lastJob";
import { saveRecent } from "../store/recents";
import { takePendingScan, takePendingScanError } from "../store/pendingScan";
import { goBack, navigate, replaceWith } from "./nav";
import { useBackHandler } from "./back";

export type ToolFlowProps = {
  id: ToolId;
  nativeScan?: NativeScanAdapter;
  loadNativeScanDraft?: typeof loadScanDraft;
  onNativePresentation?: (phase: 'pending' | 'explicit' | 'ready') => void;
  onEmptyScanClose?: () => void;
  presentationActive?: boolean;
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

const LEVELS: { id: CompressLevel; label: string; note: string }[] = [
  {
    id: "keep",
    label: "Recommended",
    note: "Resizes photos, scans and maps to 200 DPI, sharp enough to zoom into fine print. Text, links and forms stay as they are.",
  },
  {
    id: "balanced",
    label: "Strong",
    note: "Resizes images to 150 DPI. Smaller files; very fine print gets softer when zoomed. Text, links and forms stay as they are.",
  },
  {
    id: "strong",
    label: "Extreme",
    note: "Turns every page into a 120 DPI image. Loses zoom detail on large maps and posters, plus selectable text, links, forms and signatures.",
  },
];

const PDF_INPUT_TOOLS = new Set<ToolId>([
  "merge",
  "split",
  "pdf-images",
  "compress",
  "watermark",
  "numbers",
  "protect",
  "pdf-docx",
]);

const ACTION_LABELS: Record<Exclude<ToolId, "view">, string> = {
  merge: "Merge PDFs",
  split: "Extract pages",
  images: "Create PDF",
  "pdf-images": "Export images",
  compress: "Compress PDF",
  scan: "Create scanned PDF",
  organize: "Organize",
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

const pickedFileIds = new WeakMap<PickedFile, string>();
let nextPickedFileId = 0;
/** Stable per-object key so reordered files keep their preview and focus. */
function pickedFileId(file: PickedFile): string {
  let id = pickedFileIds.get(file);
  if (!id) {
    id = `picked-${++nextPickedFileId}`;
    pickedFileIds.set(file, id);
  }
  return id;
}

export function ToolFlow({ id, nativeScan, loadNativeScanDraft = loadScanDraft, onNativePresentation, onEmptyScanClose, presentationActive = true }: ToolFlowProps) {
  const tool = TOOL_BY_ID[id];
  const pro = usePro();
  const [initialScan] = useState(() => takeInitialScan(id));
  const queuedOrganizeGroup = id === 'organize' && initialScan.files.length > 0 &&
    !(initialScan.files.length === 1 && (initialScan.files[0]!.mime === 'application/pdf' || /\.pdf$/i.test(initialScan.files[0]!.name)));
  const [picked, setPicked] = useState<PickedFile[]>(queuedOrganizeGroup ? [] : initialScan.files);
  const [error, setError] = useState<string | null>(initialScan.error);
  const [cameraOpen, setCameraOpen] = useState(
    () => id === "scan" && initialScan.files.length === 0,
  );
  const [nativePresentation, setNativePresentation] = useState<'pending' | 'explicit'>('pending');
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStep, setScanStep] = useState<"edit" | "pdf">("edit");
  const [scanName, setScanName] = useState(defaultScanPdfName);
  const scanNameEdited = useRef(false);
  const [draftReady, setDraftReady] = useState(id !== 'scan' || initialScan.files.length > 0);
  const [scanEdits, setScanEdits] = useState<(ScanPageDraft | null)[]>([]);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguage>('eng');
  const [unlockedPdfs, setUnlockedPdfs] = useState<Set<PickedFile>>(() => new Set());
  const [failedPdfs, setFailedPdfs] = useState<Set<PickedFile>>(() => new Set());
  const [passwordPrompt, setPasswordPrompt] = useState<{file:PickedFile;incorrect:boolean} | null>(null);
  const [inputPassword, setInputPassword] = useState('');
  const passwordReply = useRef<((password:string)=>void) | null>(null);
  const pendingPdf = PDF_INPUT_TOOLS.has(id)
    ? picked.find((file) => !file.password && !unlockedPdfs.has(file) && !failedPdfs.has(file))
    : undefined;
  const checkingPdf = !!pendingPdf;
  const hasFailedPdf = PDF_INPUT_TOOLS.has(id) && picked.some((file) => failedPdfs.has(file));
  useEffect(() => {
    if (!presentationActive || !pendingPdf) return;
    const controller = new AbortController();
    let enteredPassword = pendingPdf.password;
    let rejectReply: ((reason: Error) => void) | undefined;
    void engine.openViewer(pendingPdf, undefined, {
      indexText: false,
      signal: controller.signal,
      onPassword: (incorrect) => new Promise<string>((resolve, reject) => {
        if (controller.signal.aborted) { reject(new Error('Cancelled')); return; }
        rejectReply = reject;
        passwordReply.current = (value) => {
          enteredPassword = value;
          passwordReply.current = null;
          setPasswordPrompt(null);
          resolve(value);
        };
        setInputPassword('');
        setPasswordPrompt({ file: pendingPdf, incorrect });
      }),
    }).then(async (session) => {
      await session.destroy();
      if (!controller.signal.aborted) {
        const updated = enteredPassword ? { ...pendingPdf, password: enteredPassword } : pendingPdf;
        if (enteredPassword) {
          const existingId = pickedFileIds.get(pendingPdf);
          if (existingId) pickedFileIds.set(updated, existingId);
          setPicked((prev) => prev.map((file) => (file === pendingPdf ? updated : file)));
        }
        setUnlockedPdfs((prev) => {
          const next = new Set(prev);
          next.add(pendingPdf);
          next.add(updated);
          return next;
        });
        setPasswordPrompt(null);
        setInputPassword('');
      }
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setFailedPdfs((prev) => {
          const next = new Set(prev);
          next.add(pendingPdf);
          return next;
        });
        setError(err instanceof Error ? err.message : 'Could not open this PDF.');
      }
    });
    return () => {
      controller.abort();
      rejectReply?.(new Error('Cancelled'));
      passwordReply.current = null;
    };
  }, [pendingPdf, presentationActive]);
  const [docxInspection, setDocxInspection] = useState<{file:PickedFile;warnings:string[]} | null>(null);
  const docxChecking = id === 'docx-pdf' && !!picked[0] && docxInspection?.file !== picked[0];
  const docxWarnings = docxInspection?.file === picked[0] ? docxInspection?.warnings ?? [] : [];
  useEffect(() => {
    const file = picked[0];
    if(!presentationActive || id !== 'docx-pdf' || !file) return;
    let current=true;
    void import('../pdf/docxToPdf').then(module=>module.inspectDocx(file))
      .then(warnings=>{if(current)setDocxInspection({file,warnings});})
      .catch(error=>{if(current)setDocxInspection({file,warnings:[error instanceof Error ? error.message : 'Could not inspect this document.']});});
    return ()=>{current=false;};
  }, [id,picked,presentationActive]);
  const [draftStatus, setDraftStatus] = useState('');
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [scanRevision, setScanRevision] = useState(0);
  const scanCompleted = useRef(false);

  useBackHandler(() => {
    if (!presentationActive || id !== "scan" || cameraOpen) return false;
    if (scanStep === "pdf") {
      setScanStep("edit");
      return true;
    }
    return false;
  });

  const [jobProgress, setJobProgress] = useState<number | undefined>();
  const [jobLabel, setJobLabel] = useState("Working on-device\u2026");
  const [pageCount, setPageCount] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [compressLevel, setCompressLevel] = useState<CompressLevel>("keep");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.28);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const organizeInputActive = tool.id === "organize";
  const [organizeReady,setOrganizeReady]=useState<{source:PickedFile;file:PickedFile}|null>(null);
  const [organizeInputBusy,setOrganizeInputBusy]=useState(false);
  const organizeRequest=useRef<AbortController|null>(null);
  // Organize: every page in display order, plus the pages left out of the output.
  const [pageArrangement, setPageArrangement] = useState<number[]>([]);
  const [pageExcluded, setPageExcluded] = useState<number[]>([]);
  const pageOrder = useMemo(() => {
    const excluded = new Set(pageExcluded);
    return pageArrangement.filter((page) => !excluded.has(page));
  }, [pageArrangement, pageExcluded]);
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
  useEffect(() => {
    if (id !== 'scan' || initialScan.files.length) return;
    let cancelled = false;
    void loadNativeScanDraft().then(draft => {
      if (cancelled) return;
      if (draft) {
        setPicked(draft.files);setScanEdits(draft.edits);setScanStep(draft.step);
        setScanName(draft.name);scanNameEdited.current=true;setImageOptions(draft.options);setCameraOpen(false);
      }
    }).catch(() => {if(!cancelled)setDraftStatus('Could not restore the last scan.');})
      .finally(() => {if(!cancelled)setDraftReady(true);});
    return () => { cancelled = true; };
  }, [id, initialScan, loadNativeScanDraft]);
  useLayoutEffect(() => {
    if (id === 'scan' && nativeScan) onNativePresentation?.(
      !draftReady || cameraOpen ? nativePresentation : 'ready',
    );
  }, [id, nativeScan, draftReady, cameraOpen, nativePresentation, onNativePresentation]);
  useEffect(() => {
    if(id !== 'scan' || !draftReady || scanCompleted.current) return;
    let current=true;
    void saveScanDraft({version:1,files:picked,edits:scanEdits,step:scanStep,name:scanName,options:imageOptions,updatedAt:Date.now()})
      .then(() => {if(current)setDraftStatus(picked.length ? 'Draft saved on this device' : '');})
      .catch(() => {if(current)setDraftStatus('Draft could not be saved. Keep this screen open until you export.');});
    return () => {current=false;};
  }, [id,draftReady,picked,scanEdits,scanStep,scanName,imageOptions]);
  const [watermarkAngle, setWatermarkAngle] = useState(-35);
  const jobController = useRef<AbortController | null>(null);
  const componentMounted = useRef(true);
  useLayoutEffect(() => {
    componentMounted.current = true;
    return () => { componentMounted.current = false; organizeRequest.current?.abort(); };
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = presentationActive;
    return () => {
      mounted.current = false;
      organizeRequest.current?.abort();
      if (jobController.current) {
        jobController.current.abort();
        cancelPendingJobs();
      }
    };
  }, [presentationActive]);
  function cancelJob() {
    jobController.current?.abort();
    cancelPendingJobs();
    setJobLabel("Cancelling\u2026");
  }
  function reorderFiles(order: number[]) {
    setPicked((files) =>
      order.length === files.length ? order.map((from) => files[from]!) : files,
    );
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
  const multiple = tool.id === "organize" || tool.accept === "pdfs" || tool.accept === "images";
  const copy = wellCopy(tool.id, tool.minFiles);
  const reorderable = tool.accept === "pdfs" || tool.accept === "images";
  // Multi-file tools put the file list's reorder control beside a compact,
  // centred main button in the bottom action row.
  const [actionStart, setActionStart] = useState<HTMLElement | null>(null);
  const actionSlots = useMemo(
    () => (multiple ? { start: actionStart } : null),
    [actionStart, multiple],
  );
  const wellItems = useMemo(
    () =>
      picked.map((file) => ({
        name: file.name,
        size: file.bytes.byteLength,
        id: pickedFileId(file),
        source: file,
      })),
    [picked],
  );

  useEffect(() => {
    const file = picked[0];
    if (!file || checkingPdf || failedPdfs.has(file) || !["split", "pdf-images"].includes(tool.id)) return;
    let cancelled = false;
    void engine
      .pageCount(file)
      .then((count) => {
        if (cancelled) return;
        setPageCount(count);
        setStartPage(1);
        setEndPage(Math.max(1, count));
        setPageArrangement(Array.from({ length: count }, (_, index) => index));
        setPageExcluded([]);
        setPageRotations({});
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
  }, [picked, tool.id, checkingPdf, failedPdfs]);

  async function onPick(fileList: FileList): Promise<void> {
    setError(null);
    if(tool.id==='organize'){
      organizeRequest.current?.abort();const owner=new AbortController();organizeRequest.current=owner;setOrganizeInputBusy(true);
      const current=()=>!owner.signal.aborted&&componentMounted.current&&window.location.hash.split('?')[0]==='#/tool/organize';
      const ask=(incorrect:boolean)=>new Promise<string>((resolve,reject)=>{
        if(!current()){reject(new DOMException('Cancelled','AbortError'));return;}
        const cancel=()=>{reject(new DOMException('Cancelled','AbortError'));if(organizeRequest.current===owner){setPasswordPrompt(null);setInputPassword('');passwordReply.current=null;}};
        owner.signal.addEventListener('abort',cancel,{once:true});
        setInputPassword('');setPasswordPrompt({file:picked[0]??{name:'PDF',mime:'application/pdf',bytes:new Uint8Array()},incorrect});
        passwordReply.current=value=>{owner.signal.removeEventListener('abort',cancel);setPasswordPrompt(null);setInputPassword('');passwordReply.current=null;resolve(value);};
      });
      try{const file=await prepareOrganizeInput(Array.from(fileList),owner.signal,ask);if(current()){resetPageState();setOrganizeReady(null);setPicked([file]);}}
      catch(err){if(current())setError(err instanceof Error?err.message:'Could not prepare these files.');}
      finally{if(organizeRequest.current===owner){organizeRequest.current=null;if(componentMounted.current)setOrganizeInputBusy(false);}}
      return;
    }
    try {
      const incoming = tool.id === "scan" ? await fileListToScanImages(fileList) : await fileListToPicked(
        fileList,
        tool.accept === "images",
      );
      const combined = multiple ? [...picked, ...incoming] : incoming;
      if (
        combined.length > 200 ||
        (tool.id==='scan'?retainedScanBytes(combined):combined.reduce((sum, file) => sum + file.bytes.length, 0)) >
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
    if (tool.id === "organize") organizeRequest.current?.abort();
    resetPageState();
    setPicked((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    if (!queuedOrganizeGroup) return;
    const files = initialScan.files.map(file => new File([file.bytes.slice().buffer], file.name, {type:file.mime}));
    const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file));
    void onPick(transfer.files);
    const owner = organizeRequest.current;
    return () => owner?.abort();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Consume this immutable queued group per tool identity, including StrictMode replay.
  }, [initialScan, queuedOrganizeGroup]);

  function resetPageState(): void {
    setOrganizeReady(null);
    setPageCount(0);
    setSelection("");
    setStartPage(1);
    setEndPage(1);
    setPageArrangement([]);
    setPageExcluded([]);
    setPageRotations({});
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
        return pageCount > 0 && pageOrder.length > 0 && organizeReady?.source === picked[0] && !organizeInputBusy;
      default:
        return true;
    }
  }

  function buildOps(count: number): OrganizeOp[] {
    const ops: OrganizeOp[] = [];
    const order = pageOrder.filter(index=>index>=0&&index<count);
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

  function rotatePage(pageIndex: number): void {
    setPageRotations((current) => ({
      ...current,
      [pageIndex]: (current[pageIndex] ?? 0) + 90,
    }));
  }

  function togglePage(page: number): void {
    setPageExcluded((current) =>
      current.includes(page)
        ? current.filter((value) => value !== page)
        : [...current, page],
    );
  }

  function applyTapOrder(sequence: number[]): void {
    const chosen = new Set(sequence);
    const rest = pageArrangement.filter((page) => !chosen.has(page));
    setPageArrangement([...sequence, ...rest]);
    setPageExcluded(rest);
  }

  function resetPageArrangement(): void {
    setPageArrangement(Array.from({ length: pageCount }, (_, index) => index));
    setPageExcluded([]);
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
    if (checkingPdf || hasFailedPdf) return;
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
    setJobProgress(tool.id === "pdf-docx" || tool.id === "compress" ? 0 : undefined);
    setJobLabel(tool.id === "pdf-docx" ? "Reading PDF" : tool.id === "compress" ? "Optimizing PDF" : "Working on-device\u2026");
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
          result = await engine.organize(organizeReady!.file, buildOps(pageCount));
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
            ocrLanguage,
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
      if (tool.id === 'scan') {scanCompleted.current=true;await clearScanDraft();}
      navigate("#/result");
    } catch (err) {
      if (mounted.current && !controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (componentMounted.current) {
        setBusy(false);
        if (controller.signal.aborted && mounted.current)
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
    !organizeInputBusy &&
    !checkingPdf &&
    !hasFailedPdf &&
    !(tool.id === 'docx-pdf' && docxChecking) &&
    tool.id !== "view" &&
    picked.length >= tool.minFiles &&
    extraValid();
  const hasFile = picked.length >= tool.minFiles;

  function blockedReason(): string | null {
    if (scanBusy) return "Finish or cancel the page adjustment first.";
    if (tool.id === 'organize' && organizeInputBusy) return 'Preparing PDF or images\u2026';
    if (locked) return "This tool is not available right now.";
    if (tool.id === "view") return null;
    if (picked.length < tool.minFiles) {
      if (tool.id === "merge") return "Add at least 2 PDFs to merge.";
      if (tool.id === "scan") return "Take or choose a photo first.";
      if (tool.id === 'organize') return 'Choose a PDF or images first.';
      if (tool.id === "images") {
        return tool.minFiles === 1
          ? "Add a photo first."
          : `Add at least ${tool.minFiles} images.`;
      }
      if (tool.id === "docx-pdf") return "Choose a Word file first.";
      return "Choose a PDF first.";
    }
    if (passwordPrompt) return "Unlock the password-protected PDF first.";
    if (checkingPdf) return "Checking PDF access\u2026";
    if (hasFailedPdf) return "Remove or replace the unreadable PDF first.";
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
      pageOrder.length === 0
    ) {
      return "Keep at least one page before organizing.";
    }
    return null;
  }

  // An action that isn't ready yet still takes the tap and explains why in a
  // toast, instead of a hint line sitting above the button.
  const whenReady = (action: () => void) => () => {
    if (canRun) {
      action();
      return;
    }
    const reason = blockedReason();
    if (reason) showToast(reason);
  };
  const scanPdf = tool.id === "scan" && scanStep === "pdf";

  const scanCamera = tool.id === "scan" && cameraOpen && draftReady ? (
      <ScanCamera
        nativeScan={nativeScan}
        onPresentation={setNativePresentation}
        pages={retakeIndex === null ? picked : []}
        maxPages={retakeIndex === null ? scanMaxPages : 1}
        onPages={(next) => {
          const replacement=retakeIndex !== null && next[0] ? replaceScanPage(picked,retakeIndex,next[0]) : null;
          if(!replacement)assertScanBudget(next,scanMaxPages);
          setError(null);
          if(retakeIndex !== null && next[0]) {
            setPicked(replacement!);
            setScanEdits(edits => edits.map((edit,i) => i===retakeIndex ? null : edit));
            setScanRevision(value=>value+1);setRetakeIndex(null);
          } else setPicked(next);
          setCameraOpen(false);
          setScanStep("edit");
        }}
        onClose={() => {
          setRetakeIndex(null);
          if (picked.length === 0 && onEmptyScanClose) { onEmptyScanClose(); return; }
          setCameraOpen(false);
          if (picked.length === 0) replaceWith("#/");
        }}
        onUse={() => setCameraOpen(false)}
      />
    ) : null;

  return (
    <ActionSlotsContext.Provider value={actionSlots}>
    {nativeScan && tool.id === 'scan' && !draftReady ? createPortal(
      <button autoFocus className="btn native-capture-cancel" onClick={onEmptyScanClose ?? (() => goBack())}>Cancel scan</button>, document.body,
    ) : null}
    {tool.id === 'scan' && !draftReady ? <p role="status">Restoring your scan…</p> : null}
    {scanCamera}
    <div
      style={tool.id === "scan" && cameraOpen && (!nativeScan || nativePresentation === 'explicit') ? {display: "none"} : undefined}
      inert={tool.id === 'scan' && cameraOpen ? true : undefined}
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
            accept={tool.id === "organize" ? "application/pdf,image/*" : acceptAttr(tool.accept)}
            multiple={multiple}
            disabled={organizeInputActive && (busy || organizeInputBusy)}
            files={wellItems}
            onPick={(list) => {
              void onPick(list);
            }}
            onRemove={onRemove}
            onMove={multiple ? moveFile : undefined}
            onReorder={reorderable ? reorderFiles : undefined}
            label={tool.id === "organize" ? "Choose PDF or images" : copy.label}
            hint={tool.id === "organize" ? "One PDF OR up to 200 supported images \u00b7 128 MB total" : copy.hint}
            hideFile={tool.id === "organize"}
          />
        ) : null}

        {tool.id === "docx-pdf" ? (
          <>
          <p className="ps-note">
            Page margins, blank lines, and space before/after follow the Word
            file. Nested tables and text boxes still will not match. Bundled
            fonts preserve Latin, Greek and Cyrillic text. Files with
            unsupported characters are rejected instead of changing the text.
          </p>
          {docxChecking ? <p role="status">Checking document compatibility…</p> : null}
          {docxWarnings.length ? <div className="ps-banner" role="status"><strong>Before you convert</strong>{docxWarnings.map(warning=><p key={warning}>{warning}</p>)}</div> : null}
          </>
        ) : null}
        {tool.id === "organize" && organizeInputBusy ? <p role="status">Preparing organizer input…</p> : null}
        {PDF_INPUT_TOOLS.has(tool.id) || tool.id === "organize" ? (
          <>
          {passwordPrompt && (tool.id === "organize" || passwordPrompt.file === pendingPdf) ? (
            <form className="ps-banner" aria-label="Unlock PDF" onSubmit={event=>{event.preventDefault();passwordReply.current?.(inputPassword);}}>
              <p>This PDF is password protected. Enter its password to continue.</p>
              {passwordPrompt.incorrect ? <p role="alert">That password was incorrect. Try again.</p> : null}
              <label className="ps-field">Document password<input autoFocus type="password" autoComplete="off" value={inputPassword} onChange={event=>setInputPassword(event.target.value)} /></label>
              <div className="ps-row">
                <button type="submit" className="btn">Unlock PDF</button>
                <button type="button" className="btn btn--ghost" onClick={()=>{if(tool.id === "organize")organizeRequest.current?.abort();else setPicked(prev=>prev.filter(file=>file!==passwordPrompt.file));setPasswordPrompt(null);setInputPassword('');}}>Cancel</button>
              </div>
            </form>
          ) : checkingPdf ? <p role="status">Checking PDF access…</p> : null}
          {tool.id === "pdf-docx" ? <><label className="ps-field">Scanned text language<select aria-label="Scanned text language" value={ocrLanguage} disabled={busy} onChange={event=>setOcrLanguage(event.target.value as OcrLanguage)}>{OCR_LANGUAGES.map(language=><option key={language.id} value={language.id}>{language.label}</option>)}</select></label>
          <p className="ps-note">
            Rebuilds styled text, detected tables, and two-column layouts.
            Scanned pages use the selected language entirely on-device; uncertain
            pages stay as full-page images instead of returning unreliable text.
          </p></> : null}
          </>
        ) : null}

        {tool.id === "scan" && draftReady && picked.length > 0 ? (
          <div hidden={scanStep !== "edit"} className="ps-scan-review">
          <ScanEditor
            importError={error}
            key={scanRevision}
            initialEdits={scanEdits}
            onDrafts={setScanEdits}
            onFiles={files => {setPicked(files);if(!files.length)setCameraOpen(true);}}
            onRetake={index => {setRetakeIndex(index);setCameraOpen(true);}}
            onDone={() => {
              if (!scanNameEdited.current) setScanName(defaultScanPdfName());
              setScanStep("pdf");
              window.scrollTo(0, 0);
            }}
            onCamera={() => setCameraOpen(true)}
            onDiscard={() => {
              scanCompleted.current = true;
              void clearScanDraft()
                .catch(() => undefined)
                .then(() => replaceWith("#/"));
            }}
            onGallery={(list) => { void onPick(list); }}
            maxPages={scanMaxPages}
            files={picked}
            onBusyChange={setScanBusy}
            onChange={(original, file) =>
              setPicked((files) =>
                files.map((item) => (item === original ? file : item)),
              )
            }
          />
          {draftStatus ? <p className="scan-draft-status" role="status">{draftStatus}</p> : null}
          </div>
        ) : null}
        {tool.id === "split" && hasFile ? (
          <section className="ps-tool-settings" aria-labelledby="split-settings">
            <div className="ps-tool-settings__intro">
              <h2 id="split-settings">Split settings</h2>
              <p>
                Extract a page range, or list exact pages below to pick
                those instead.
              </p>
            </div>
            {!selection.trim() ? (
              <div className="ps-range">
                <label className="ps-field">
                  Start page
                  <input
                    type="number"
                    min={1}
                    max={pageCount || undefined}
                    value={startPage}
                    onChange={(event) => setStartPage(Number(event.target.value))}
                  />
                </label>
                <label className="ps-field">
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
            ) : null}
            <label className="ps-field">
              Pages (optional)
              <input
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder="For example: 1-3, 5, 8-10"
              />
            </label>
          </section>
        ) : null}
        {tool.id === "pdf-images" && hasFile ? (
          <label className="ps-field">
            Pages (optional)
            <input
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              placeholder="For example: 1-3, 5, 8-10"
            />
            <span className="ps-note">
              {pageCount || "Reading"} pages. Leave blank to use all pages
              (up to 200).
            </span>
          </label>
        ) : null}

        {tool.id === "compress" && hasFile ? (
          <>
            <div className="ps-segmented" role="group" aria-label="Compression level">
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
              {LEVELS.find((level) => level.id === compressLevel)?.note}{" "}
              Signed PDFs are returned unchanged. Ream keeps the original if it is smaller.
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
                <option value="jpeg">JPEG - smaller files</option>
                <option value="png">PNG - lossless images</option>
              </select>
            </label>
            <label className="ps-field ps-grow">
              Resolution
              <select
                value={imageScale}
                onChange={(e) => setImageScale(Number(e.target.value))}
              >
                <option value={1}>72 DPI - screen</option>
                <option value={2}>144 DPI - balanced</option>
                <option value={3}>216 DPI - detailed</option>
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
            <label className="ps-switch">
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

        {tool.id === "organize" && picked[0] ? <>
          <OrganizeGrid active={presentationActive} file={picked[0]} arrangement={pageArrangement} order={pageOrder} rotations={pageRotations} disabled={busy || organizeInputBusy}
            onSelect={togglePage}
            onMove={(from,to)=>{setPageArrangement(current=>movedOrder(current,from,to));}}
            onTapOrder={applyTapOrder}
            onRotate={rotatePage}
            onReady={(file,count)=>{
              setPageCount(count);
              setOrganizeReady({source:picked[0]!,file});
              // A re-ready of the same document keeps the user's arrangement.
              setPageArrangement(current=>current.length===count?current:Array.from({length:count},(_,i)=>i));
              setPageExcluded(current=>current.every(page=>page<count)?current:[]);
            }}
            onError={setError}/>
        </> : null}

        {tool.id === "scan" && scanStep === "edit" ? null : tool.id !== "view" ? (
          <div className={`ps-actions${tool.id === "scan" ? " ps-actions--row ps-actions--follow" : " ps-actions--sticky"}`}>
            {tool.id === "scan" ? <>
              <AnimatedButton aria-disabled={!canRun || undefined} onClick={whenReady(() => void run("save"))}>Save PDF</AnimatedButton>
              <AnimatedButton variant="ghost" aria-disabled={!canRun || undefined} onClick={whenReady(() => void run("share"))}>Share PDF</AnimatedButton>
            </> : multiple ? (
              <div className="ps-actions__bar">
                <div className="ps-actions__side" ref={setActionStart} />
                <AnimatedButton className="ps-actions__main" aria-disabled={!canRun || undefined} onClick={whenReady(() => void run())}>
                  {ACTION_LABELS[tool.id as Exclude<ToolId, "view">]}
                </AnimatedButton>
                {tool.id === "organize" && pageCount ? (
                  <div className="ps-actions__side ps-actions__side--end">
                    <AnimatedButton variant="ghost" icon={Undo2} aria-label="Reset to original" disabled={busy} onClick={resetPageArrangement}>Reset</AnimatedButton>
                  </div>
                ) : (
                  <div className="ps-actions__side" aria-hidden="true" />
                )}
              </div>
            ) : (
              <div className="ps-actions__bar">
                <div className="ps-actions__side" aria-hidden="true" />
                <AnimatedButton className="ps-actions__main" aria-disabled={!canRun || undefined} onClick={whenReady(() => void run())}>
                  {ACTION_LABELS[tool.id as Exclude<ToolId, "view">]}
                </AnimatedButton>
                <div className="ps-actions__side" aria-hidden="true" />
              </div>
            )}
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
    </ActionSlotsContext.Provider>
  );
}

function normalizeQuarterTurn(degrees: number): 0 | 90 | 180 | 270 {
  return (((degrees % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}
