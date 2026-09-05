import type {
  OrganizeOp,
  PageRange,
  ProtectInput,
  WatermarkInput,
  WordToPdfReport,
  ImagePdfOptions,
  PageNumberOptions,
} from "../lib/types";

export type TransferFile = {
  name: string;
  mime: string;
  bytes: ArrayBuffer;
};

export type WorkerOp =
  | { op: "merge"; files: TransferFile[] }
  | { op: "split"; file: TransferFile; range: PageRange }
  | { op: "imagesToPdf"; files: TransferFile[]; options?: ImagePdfOptions }
  | { op: "watermark"; file: TransferFile; input: WatermarkInput }
  | { op: "pageNumbers"; file: TransferFile; options?: PageNumberOptions }
  | { op: "optimize"; file: TransferFile }
  | { op: "protect"; file: TransferFile; input: ProtectInput }
  | { op: "organize"; file: TransferFile; ops: OrganizeOp[] }
  | { op: "pageCount"; file: TransferFile }
  | { op: "docxToPdf"; file: TransferFile };

export type WorkerRequest = WorkerOp & { id: number };

export type WorkerSuccess = {
  id: number;
  ok: true;
  bytes?: ArrayBuffer;
  filename?: string;
  pageCount: number;
  extra?: {
    wordToPdf?: WordToPdfReport;
  };
};

export type WorkerFailure = {
  id: number;
  ok: false;
  message: string;
};

export type WorkerResponse = WorkerSuccess | WorkerFailure;
