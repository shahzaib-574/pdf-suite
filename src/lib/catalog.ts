import type { ToolId } from './types';

export type ToolDef = {
  id: ToolId;
  title: string;
  blurb: string;
  group: 'everyday' | 'pages' | 'lock';
  /** Shown as Pro in the UI. Phase 1 ships unlocked; settings can toggle. */
  pro: boolean;
  accept: 'pdf' | 'pdfs' | 'images' | 'docx' | 'none';
  minFiles: number;
  maxFilesFree: number;
  available?: boolean;
};

export const TOOLS: ToolDef[] = [
  {
    id: 'merge',
    title: 'Merge',
    blurb: 'Combine PDFs into one file',
    group: 'everyday',
    pro: false,
    accept: 'pdfs',
    minFiles: 2,
    maxFilesFree: 2,
  },
  {
    id: 'split',
    title: 'Split',
    blurb: 'Extract a page range',
    group: 'pages',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'images',
    title: 'Images → PDF',
    blurb: 'Photos into a single PDF',
    group: 'everyday',
    pro: false,
    accept: 'images',
    minFiles: 1,
    maxFilesFree: 10,
  },
  {
    id: 'pdf-images',
    title: 'PDF → Images',
    blurb: 'Export pages as JPG',
    group: 'pages',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'compress',
    title: 'Compress',
    blurb: 'Shrink for chat or email',
    group: 'everyday',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'scan',
    title: 'Scan',
    blurb: 'Camera to PDF, on-device',
    group: 'everyday',
    pro: false,
    accept: 'images',
    minFiles: 1,
    maxFilesFree: 3,
  },
  {
    id: 'organize',
    title: 'Organize',
    blurb: 'Rotate, reorder, drop pages',
    group: 'pages',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'watermark',
    title: 'Watermark',
    blurb: 'Stamp text on every page',
    group: 'lock',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'numbers',
    title: 'Page numbers',
    blurb: 'Footer numbers on each page',
    group: 'pages',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'protect',
    title: 'Protect',
    blurb: 'Lock with a password you set',
    group: 'lock',
    pro: true,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'view',
    title: 'View',
    blurb: 'Open a PDF on this device',
    group: 'everyday',
    pro: false,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'docx-pdf',
    title: 'Word → PDF',
    blurb: 'DOCX to PDF, on this device',
    group: 'everyday',
    pro: false,
    accept: 'docx',
    minFiles: 1,
    maxFilesFree: 1,
  },
  {
    id: 'pdf-docx',
    title: 'PDF → Word',
    blurb: 'Extract text into a DOCX',
    group: 'everyday',
    pro: false,
    accept: 'pdf',
    minFiles: 1,
    maxFilesFree: 1,
  },
];

export const APP_NAME = 'Ream - PDF Suite';
export const APP_SHORT_NAME = 'Ream';
export const APP_TAGLINE = 'PDF Suite · On-device. Your files stay here.';

export function toolById(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
