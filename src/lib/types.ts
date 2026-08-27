export type ToolId =
  | 'merge'
  | 'split'
  | 'images'
  | 'pdf-images'
  | 'compress'
  | 'scan'
  | 'organize'
  | 'watermark'
  | 'numbers'
  | 'protect'
  | 'view'
  | 'docx-pdf'
  | 'pdf-docx';

export type PdfBytes = Uint8Array;

export type PickedFile = {
  name: string;
  mime: string;
  bytes: Uint8Array;
};

export type PageRange = {
  start: number;
  end: number;
};

export type CompressLevel = 'strong' | 'balanced' | 'keep';

export type WatermarkInput = {
  text: string;
  opacity: number;
};

export type ProtectInput = {
  userPassword: string;
};

export type OrganizeOp =
  | { type: 'rotate'; pageIndex: number; degrees: 90 | 180 | 270 }
  | { type: 'remove'; pageIndex: number }
  | { type: 'reorder'; order: number[] };

export type JobOk = {
  ok: true;
  bytes: Uint8Array;
  filename: string;
  pageCount?: number;
  mime?: string;
  extra?: {
    images?: Blob[];
    pdfToDocx?: PdfToDocxReport;
    wordToPdf?: WordToPdfReport;
  };
};

export type PdfToDocxReport = {
  editablePages: number;
  imageOnlyPages: number;
  tables: number;
  columnGroups: number;
  images: number;
  warnings: string[];
};

export type WordToPdfReport = {
  replacedChars: number;
  warnings: string[];
};

export type JobErr = {
  ok: false;
  message: string;
};

export type JobResult = JobOk | JobErr;

export type PdfToDocxProgress = {
  progress: number;
  label: string;
};

export type RecentItem = {
  id: string;
  name: string;
  mime: string;
  tool: ToolId;
  createdAt: number;
  bytes: Uint8Array;
  size: number;
};

export type Route =
  | { name: 'home' }
  | { name: 'recents' }
  | { name: 'tool'; id: ToolId }
  | { name: 'viewer'; recentId?: string }
  | { name: 'result' }
  | { name: 'settings' };
