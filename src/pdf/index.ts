/**
 * PDF engine public API.
 * Implementation lives in this folder. Screens import only from here.
 */
import type { OcrLanguage } from '../lib/ocrLanguages';
export { unprotectPdf } from "./protectPdf";
import type {
  CompressLevel,
  JobOk,
  JobResult,
  OrganizeOp,
  PageRange,
  PdfToDocxProgress,
  PickedFile,
  ProtectInput,
  WatermarkInput,
  ImagePdfOptions,
  PageNumberOptions,
  ExportImageOptions,
  JobControl,
} from "../lib/types";
import type { PdfViewerSession } from "./render";
import type {
  TransferFile,
  WorkerOp,
  WorkerProgress,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";
import { copyBuffer, humanError } from "./util";

function renderApi() {
  return import("./render");
}

export type PdfEngine = {
  merge(files: PickedFile[]): Promise<JobResult>;
  split(file: PickedFile, range: PageRange): Promise<JobResult>;
  imagesToPdf(
    files: PickedFile[],
    options?: ImagePdfOptions,
  ): Promise<JobResult>;
  pdfToImages(
    file: PickedFile,
    options?: ExportImageOptions,
    control?: JobControl,
  ): Promise<JobResult>;
  compress(
    file: PickedFile,
    level: CompressLevel,
    control?: JobControl,
  ): Promise<JobResult>;
  watermark(file: PickedFile, input: WatermarkInput): Promise<JobResult>;
  pageNumbers(
    file: PickedFile,
    options?: PageNumberOptions,
  ): Promise<JobResult>;
  protect(file: PickedFile, input: ProtectInput): Promise<JobResult>;
  organize(file: PickedFile, ops: OrganizeOp[]): Promise<JobResult>;
  pageCount(file: PickedFile): Promise<number>;
  renderPage(file: PickedFile, pageIndex: number, width: number): Promise<Blob>;
  openViewer(
    file: PickedFile,
    onProgress?: (current: number, total: number) => void,
    options?: {
      signal?: AbortSignal;
      onPassword?: (incorrect: boolean) => Promise<string>;
      indexText?: boolean;
    },
  ): Promise<PdfViewerSession>;
  docxToPdf(file: PickedFile): Promise<JobResult>;
  pdfToDocx(
    file: PickedFile,
    onProgress?: (update: PdfToDocxProgress) => void,
    signal?: AbortSignal,
    language?: OcrLanguage,
  ): Promise<JobResult>;
};

type Pending = {
  resolve: (value: Extract<WorkerResponse, { ok: true }>) => void;
  reject: (err: Error) => void;
  onProgress?: (update: PdfToDocxProgress) => void;
  cleanup?: () => void;
};

// Effective DPI for a full-page image, and JPEG quality. 200 DPI keeps fine
// print (maps, forms, small type) readable when zoomed; 150 DPI is still sharp.
const IMAGE_COMPRESSION = {
  keep: { dpi: 200, quality: 0.8 },
  balanced: { dpi: 150, quality: 0.7 },
} as const;

let worker: Worker | undefined;
let workerStarted = false;
let nextId = 1;
const pending = new Map<number, Pending>();

export function cancelPendingJobs(): void {
  worker?.terminate();
  worker = undefined;
  for (const job of pending.values()) {
    job.cleanup?.();
    job.reject(new Error("Processing cancelled."));
  }
  pending.clear();
}

function packFile(file: PickedFile): TransferFile {
  return {
    name: file.name,
    mime: file.mime,
    bytes: copyBuffer(file.bytes),
    password: file.password,
  };
}

function transferOf(files: TransferFile | TransferFile[]): ArrayBuffer[] {
  return Array.isArray(files) ? files.map((f) => f.bytes) : [files.bytes];
}

function getWorker(): Worker {
  if (!worker) {
    const created = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    created.addEventListener("message", onWorkerMessage);
    created.addEventListener("error", (event) => onWorkerError(created, event));
    created.addEventListener("messageerror", () =>
      failWorker(created, "PDF processing returned a result that could not be read. Try again."),
    );
    worker = created;
    workerStarted = false;
  }
  return worker;
}

function onWorkerMessage(event: MessageEvent<unknown>): void {
  // Any message, including the worker's ready signal, means it loaded.
  if (event.target === worker) workerStarted = true;
  const data = event.data;
  if (typeof data !== "object" || data === null || !("id" in data)) {
    return;
  }
  if ("progress" in data && !("ok" in data)) {
    const progress = data as WorkerProgress;
    const job = pending.get(progress.id);
    job?.onProgress?.({ progress: progress.progress, label: progress.label });
    return;
  }
  if (!("ok" in data)) return;
  const response = data as WorkerResponse;
  const job = pending.get(response.id);
  if (!job) return;
  pending.delete(response.id);
  job.cleanup?.();
  if (response.ok) job.resolve(response);
  else job.reject(new Error(response.message));
}

// A crashed worker never answers its pending jobs, so stop it and fail them
// all; the next job starts a fresh worker.
function failWorker(target: Worker, message: string): void {
  target.terminate();
  if (target !== worker) return;
  worker = undefined;
  const err = new Error(message);
  for (const job of pending.values()) {
    job.cleanup?.();
    job.reject(err);
  }
  pending.clear();
}

function onWorkerError(target: Worker, event: Event): void {
  const detail =
    typeof ErrorEvent !== "undefined" && event instanceof ErrorEvent
      ? (event.message ?? "").trim()
      : "";
  const what = workerStarted
    ? "PDF processing stopped unexpectedly"
    : "PDF processing could not start";
  failWorker(target, detail ? `${what} (${detail}). Try again.` : `${what}. Try again.`);
}

function callWorker(
  op: WorkerOp,
  transfer: ArrayBuffer[],
  control?: JobControl,
): Promise<Extract<WorkerResponse, { ok: true }>> {
  if (control?.signal?.aborted) {
    return Promise.reject(new Error("Processing cancelled."));
  }
  const id = nextId++;
  const request = { ...op, id } as WorkerRequest;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cancelPendingJobs();
    };
    const cleanup = () => {
      control?.signal?.removeEventListener("abort", onAbort);
    };
    control?.signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve,
      reject,
      onProgress: control?.onProgress,
      cleanup,
    });
    try {
      getWorker().postMessage(request, { transfer });
    } catch (err) {
      pending.delete(id);
      cleanup();
      reject(err instanceof Error ? err : new Error(humanError(err)));
    }
  });
}

function toJobOk(
  res: Extract<WorkerResponse, { ok: true }>,
  fallbackName: string,
): JobOk {
  if (!res.bytes) {
    throw new Error("PDF worker returned no file bytes.");
  }
  return {
    ok: true,
    bytes: new Uint8Array(res.bytes),
    filename: res.filename ?? fallbackName,
    pageCount: res.pageCount,
    extra: res.extra,
  };
}

async function workerJob(
  op: WorkerOp,
  transfer: ArrayBuffer[],
  fallbackName: string,
  control?: JobControl,
): Promise<JobResult> {
  try {
    return toJobOk(await callWorker(op, transfer, control), fallbackName);
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}

export const engine: PdfEngine = {
  merge(files) {
    const packed = files.map(packFile);
    return workerJob(
      { op: "merge", files: packed },
      transferOf(packed),
      "merged.pdf",
    );
  },
  split(file, range) {
    const packed = packFile(file);
    return workerJob(
      { op: "split", file: packed, range },
      transferOf(packed),
      "split.pdf",
    );
  },
  imagesToPdf(files, options) {
    const packed = files.map(packFile);
    return workerJob(
      { op: "imagesToPdf", files: packed, options },
      transferOf(packed),
      "images.pdf",
    );
  },
  async pdfToImages(file, options, control) {
    const { pdfToImages } = await renderApi();
    return pdfToImages(file, options, control);
  },
  async compress(file, level, control) {
    if (level !== "strong") {
      // Recommended / Strong: shrink embedded images, keep text and forms.
      const images = IMAGE_COMPRESSION[level];
      const packed = packFile(file);
      const result = await workerJob(
        { op: "optimize", file: packed, images },
        transferOf(packed),
        "compressed.pdf",
        control,
      );
      if (result.ok) {
        const recompressed = result.extra?.imagesRecompressed ?? 0;
        const originalRetained = result.bytes.length >= file.bytes.length;
        if (originalRetained) result.bytes = file.bytes;
        result.extra = {
          compression: {
            originalBytes: file.bytes.length,
            outputBytes: result.bytes.length,
            mode: recompressed > 0 ? "images" : "lossless",
            originalRetained,
            imagesRecompressed: recompressed,
          },
        };
      }
      return result;
    }
    const { compress } = await renderApi();
    return compress(file, level, control);
  },
  watermark(file, input) {
    const packed = packFile(file);
    return workerJob(
      { op: "watermark", file: packed, input },
      transferOf(packed),
      "watermarked.pdf",
    );
  },
  pageNumbers(file, options) {
    const packed = packFile(file);
    return workerJob(
      { op: "pageNumbers", file: packed, options },
      transferOf(packed),
      "numbered.pdf",
    );
  },
  protect(file, input) {
    const packed = packFile(file);
    return workerJob(
      { op: "protect", file: packed, input },
      transferOf(packed),
      "protected.pdf",
    );
  },
  organize(file, ops) {
    const packed = packFile(file);
    return workerJob(
      { op: "organize", file: packed, ops },
      transferOf(packed),
      "organized.pdf",
    );
  },
  async pageCount(file) {
    try {
      const packed = packFile(file);
      const res = await callWorker(
        { op: "pageCount", file: packed },
        transferOf(packed),
      );
      return res.pageCount ?? 0;
    } catch (err) {
      throw new Error(humanError(err));
    }
  },
  async renderPage(file, pageIndex, width) {
    try {
      const { renderPage } = await renderApi();
      return await renderPage(file, pageIndex, width);
    } catch (err) {
      throw new Error(humanError(err));
    }
  },
  async openViewer(file, onProgress, options) {
    try {
      const { openPdfViewer } = await renderApi();
      return await openPdfViewer(file, onProgress, options);
    } catch (err) {
      throw new Error(humanError(err));
    }
  },
  docxToPdf(file) {
    const packed = packFile(file);
    return workerJob(
      { op: "docxToPdf", file: packed },
      transferOf(packed),
      "document.pdf",
    );
  },
  async pdfToDocx(file, onProgress, signal, language) {
    try {
      const { pdfToDocx } = await import("./pdfToDocx");
      return await pdfToDocx(file, onProgress, signal, language);
    } catch (err) {
      return { ok: false, message: humanError(err) };
    }
  },
};
