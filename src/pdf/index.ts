/**
 * PDF engine public API.
 * Implementation lives in this folder. Screens import only from here.
 */
import type {
  CompressLevel,
  JobOk,
  JobResult,
  OrganizeOp,
  PageRange,
  PickedFile,
  ProtectInput,
  WatermarkInput,
} from '../lib/types';
import type { TransferFile, WorkerOp, WorkerRequest, WorkerResponse } from './protocol';
import { copyBuffer, humanError } from './util';

function renderApi() {
  return import('./render');
}

export type PdfEngine = {
  merge(files: PickedFile[]): Promise<JobResult>;
  split(file: PickedFile, range: PageRange): Promise<JobResult>;
  imagesToPdf(files: PickedFile[]): Promise<JobResult>;
  pdfToImages(file: PickedFile): Promise<JobResult>;
  compress(file: PickedFile, level: CompressLevel): Promise<JobResult>;
  watermark(file: PickedFile, input: WatermarkInput): Promise<JobResult>;
  pageNumbers(file: PickedFile): Promise<JobResult>;
  protect(file: PickedFile, input: ProtectInput): Promise<JobResult>;
  organize(file: PickedFile, ops: OrganizeOp[]): Promise<JobResult>;
  pageCount(file: PickedFile): Promise<number>;
  renderPage(
    file: PickedFile,
    pageIndex: number,
    width: number,
  ): Promise<Blob>;
  docxToPdf(file: PickedFile): Promise<JobResult>;
  pdfToDocx(file: PickedFile): Promise<JobResult>;
};

type Pending = {
  resolve: (value: Extract<WorkerResponse, { ok: true }>) => void;
  reject: (err: Error) => void;
};

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function packFile(file: PickedFile): TransferFile {
  return {
    name: file.name,
    mime: file.mime,
    bytes: copyBuffer(file.bytes),
  };
}

function transferOf(files: TransferFile | TransferFile[]): ArrayBuffer[] {
  return Array.isArray(files) ? files.map((f) => f.bytes) : [files.bytes];
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', onWorkerError);
  }
  return worker;
}

function onWorkerMessage(event: MessageEvent<unknown>): void {
  const data = event.data;
  if (typeof data !== 'object' || data === null || !('id' in data) || !('ok' in data)) {
    return;
  }
  const response = data as WorkerResponse;
  const job = pending.get(response.id);
  if (!job) return;
  pending.delete(response.id);
  if (response.ok) job.resolve(response);
  else job.reject(new Error(response.message));
}

function onWorkerError(): void {
  const err = new Error('PDF worker failed to start.');
  for (const job of pending.values()) job.reject(err);
  pending.clear();
  worker = undefined;
}

function callWorker(
  op: WorkerOp,
  transfer: ArrayBuffer[],
): Promise<Extract<WorkerResponse, { ok: true }>> {
  const id = nextId++;
  const request = { ...op, id } as WorkerRequest;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage(request, { transfer });
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(humanError(err)));
    }
  });
}

function toJobOk(
  res: Extract<WorkerResponse, { ok: true }>,
  fallbackName: string,
): JobOk {
  if (!res.bytes) {
    throw new Error('PDF worker returned no file bytes.');
  }
  return {
    ok: true,
    bytes: new Uint8Array(res.bytes),
    filename: res.filename ?? fallbackName,
    pageCount: res.pageCount,
  };
}

async function workerJob(
  op: WorkerOp,
  transfer: ArrayBuffer[],
  fallbackName: string,
): Promise<JobResult> {
  try {
    return toJobOk(await callWorker(op, transfer), fallbackName);
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}

export const engine: PdfEngine = {
  merge(files) {
    const packed = files.map(packFile);
    return workerJob({ op: 'merge', files: packed }, transferOf(packed), 'merged.pdf');
  },
  split(file, range) {
    const packed = packFile(file);
    return workerJob(
      { op: 'split', file: packed, range },
      transferOf(packed),
      'split.pdf',
    );
  },
  imagesToPdf(files) {
    const packed = files.map(packFile);
    return workerJob(
      { op: 'imagesToPdf', files: packed },
      transferOf(packed),
      'images.pdf',
    );
  },
  async pdfToImages(file) {
    const { pdfToImages } = await renderApi();
    return pdfToImages(file);
  },
  async compress(file, level) {
    const { compress } = await renderApi();
    return compress(file, level);
  },
  watermark(file, input) {
    const packed = packFile(file);
    return workerJob(
      { op: 'watermark', file: packed, input },
      transferOf(packed),
      'watermarked.pdf',
    );
  },
  pageNumbers(file) {
    const packed = packFile(file);
    return workerJob(
      { op: 'pageNumbers', file: packed },
      transferOf(packed),
      'numbered.pdf',
    );
  },
  protect(file, input) {
    const packed = packFile(file);
    return workerJob(
      { op: 'protect', file: packed, input },
      transferOf(packed),
      'protected.pdf',
    );
  },
  organize(file, ops) {
    const packed = packFile(file);
    return workerJob(
      { op: 'organize', file: packed, ops },
      transferOf(packed),
      'organized.pdf',
    );
  },
  async pageCount(file) {
    try {
      const packed = packFile(file);
      const res = await callWorker(
        { op: 'pageCount', file: packed },
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
  async docxToPdf(file) {
    try {
      const { docxToPdf } = await import('./docxToPdf');
      return await docxToPdf(file);
    } catch (err) {
      return { ok: false, message: humanError(err) };
    }
  },
  async pdfToDocx(file) {
    try {
      const { pdfToDocx } = await import('./pdfToDocx');
      return await pdfToDocx(file);
    } catch (err) {
      return { ok: false, message: humanError(err) };
    }
  },
};
