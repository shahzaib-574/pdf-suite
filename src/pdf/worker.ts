import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  toDegrees,
} from 'pdf-lib';
import type {
  OrganizeOp,
  PageRange,
  ProtectInput,
  WatermarkInput,
} from '../lib/types';
import type {
  TransferFile,
  WorkerRequest,
  WorkerResponse,
  WorkerSuccess,
} from './protocol';
import { clamp, humanError } from './util';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const IMAGE_MARGIN = 24;
const WATERMARK_ANGLE = -35;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRequest(value: unknown): value is WorkerRequest {
  return isRecord(value) && typeof value.id === 'number' && typeof value.op === 'string';
}

function bytesOf(file: TransferFile): Uint8Array {
  return new Uint8Array(file.bytes).slice();
}

async function loadPdf(file: TransferFile): Promise<PDFDocument> {
  return PDFDocument.load(bytesOf(file));
}

async function saved(
  pdf: PDFDocument,
  filename: string,
): Promise<Pick<WorkerSuccess, 'bytes' | 'filename' | 'pageCount'>> {
  const written = await pdf.save();
  const copy = new Uint8Array(written.byteLength);
  copy.set(written);
  return {
    bytes: copy.buffer as ArrayBuffer,
    filename,
    pageCount: pdf.getPageCount(),
  };
}

function hasJpegMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function imageKind(bytes: Uint8Array, name: string, mime: string): 'jpg' | 'png' | 'other' {
  if (hasJpegMagic(bytes)) return 'jpg';
  if (hasPngMagic(bytes)) return 'png';
  if (bytes.length >= 8) return 'other';
  const lowerMime = mime.toLowerCase();
  const lowerName = name.toLowerCase();
  if (
    lowerMime === 'image/jpeg' ||
    lowerMime === 'image/jpg' ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg')
  ) {
    return 'jpg';
  }
  if (lowerMime === 'image/png' || lowerName.endsWith('.png')) return 'png';
  return 'other';
}

async function merge(files: TransferFile[]) {
  if (files.length === 0) {
    throw new Error('Choose at least one PDF to merge.');
  }
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await loadPdf(file);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  if (out.getPageCount() === 0) {
    throw new Error('Those PDFs have no pages to merge.');
  }
  return saved(out, 'merged.pdf');
}

async function split(file: TransferFile, range: PageRange) {
  const src = await loadPdf(file);
  const count = src.getPageCount();
  if (count < 1) {
    throw new Error('This PDF has no pages to split.');
  }
  const start = clamp(Math.trunc(range.start), 1, count);
  const end = clamp(Math.trunc(range.end), 1, count);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const indices: number[] = [];
  for (let i = lo - 1; i <= hi - 1; i++) indices.push(i);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return saved(out, 'split.pdf');
}

async function imagesToPdf(files: TransferFile[]) {
  if (files.length === 0) {
    throw new Error('Choose at least one JPEG or PNG image.');
  }
  const unsupported: string[] = [];
  const kinds: Array<'jpg' | 'png'> = [];
  for (const file of files) {
    const bytes = bytesOf(file);
    const kind = imageKind(bytes, file.name, file.mime);
    if (kind === 'other') unsupported.push(file.name || 'unnamed');
    else kinds.push(kind);
  }
  if (unsupported.length > 0) {
    throw new Error(
      `Only JPEG and PNG can be converted here. Unsupported: ${unsupported.join(', ')}.`,
    );
  }
  const out = await PDFDocument.create();
  const maxW = A4_WIDTH - IMAGE_MARGIN * 2;
  const maxH = A4_HEIGHT - IMAGE_MARGIN * 2;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const kind = kinds[i];
    if (!file || !kind) continue;
    const bytes = bytesOf(file);
    const image =
      kind === 'jpg' ? await out.embedJpg(bytes) : await out.embedPng(bytes);
    const dims = image.scaleToFit(maxW, maxH);
    const page = out.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(image, {
      x: (A4_WIDTH - dims.width) / 2,
      y: (A4_HEIGHT - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  return saved(out, 'images.pdf');
}

function watermarkOrigin(
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
  angleDeg: number,
): { x: number; y: number } {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: pageWidth / 2 - (textWidth / 2) * cos + (textHeight / 2) * sin,
    y: pageHeight / 2 - (textWidth / 2) * sin - (textHeight / 2) * cos,
  };
}

async function watermark(file: TransferFile, input: WatermarkInput) {
  const text = input.text.trim();
  if (!text) {
    throw new Error('Enter watermark text.');
  }
  const opacity = clamp(input.opacity, 0.08, 0.35);
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.Helvetica);
  for (const page of src.getPages()) {
    const { width, height } = page.getSize();
    let size = 48;
    const maxWidth = width * 0.8;
    const measured = font.widthOfTextAtSize(text, size);
    if (measured > maxWidth && measured > 0) {
      size = (size * maxWidth) / measured;
    }
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size);
    const origin = watermarkOrigin(width, height, textWidth, textHeight, WATERMARK_ANGLE);
    page.drawText(text, {
      x: origin.x,
      y: origin.y,
      size,
      font,
      rotate: degrees(WATERMARK_ANGLE),
      opacity,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
  return saved(src, 'watermarked.pdf');
}

async function pageNumbers(file: TransferFile) {
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.Helvetica);
  const pages = src.getPages();
  const total = pages.length;
  const size = 10;
  pages.forEach((page, index) => {
    const n = index + 1;
    const label = `${n} / ${total}`;
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (page.getWidth() - textWidth) / 2,
      y: 18,
      size,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });
  return saved(src, 'numbered.pdf');
}

async function protect(
  _file: TransferFile,
  input: ProtectInput,
): Promise<Pick<WorkerSuccess, 'bytes' | 'filename' | 'pageCount'>> {
  if (!input.userPassword.trim()) {
    throw new Error('Enter a password to protect this PDF.');
  }
  // pdf-lib 1.17 SaveOptions has no userPassword / encrypt API.
  throw new Error(
    'Password protection is not supported: pdf-lib 1.17 cannot encrypt PDFs, and no extra encryption library is bundled.',
  );
}

async function organize(file: TransferFile, ops: OrganizeOp[]) {
  const src = await loadPdf(file);
  const count = src.getPageCount();
  if (count < 1) {
    throw new Error('This PDF has no pages to organize.');
  }

  // If a reorder op is present, that order is the new page sequence (copyPages).
  // Rotations then apply to indices in that resulting document.
  // Without a reorder, removes drop original indices; leftover rotate indices refer to remaining pages.
  const reorder = [...ops].reverse().find((op) => op.type === 'reorder');
  let sequence: number[];
  if (reorder) {
    const seen = new Set<number>();
    sequence = [];
    for (const index of reorder.order) {
      if (index >= 0 && index < count && !seen.has(index)) {
        seen.add(index);
        sequence.push(index);
      }
    }
  } else {
    const removed = new Set<number>();
    for (const op of ops) {
      if (op.type === 'remove' && op.pageIndex >= 0 && op.pageIndex < count) {
        removed.add(op.pageIndex);
      }
    }
    sequence = [];
    for (let i = 0; i < count; i++) {
      if (!removed.has(i)) sequence.push(i);
    }
  }

  if (sequence.length === 0) {
    throw new Error('Organize would remove every page.');
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, sequence);
  for (const page of copied) out.addPage(page);

  const pages = out.getPages();
  for (const op of ops) {
    if (op.type !== 'rotate') continue;
    const page = pages[op.pageIndex];
    if (!page) continue;
    const current = toDegrees(page.getRotation());
    const next = ((current + op.degrees) % 360 + 360) % 360;
    page.setRotation(degrees(next));
  }

  return saved(out, 'organized.pdf');
}

async function pageCount(file: TransferFile): Promise<number> {
  const src = await loadPdf(file);
  return src.getPageCount();
}

async function run(
  req: WorkerRequest,
): Promise<Pick<WorkerSuccess, 'bytes' | 'filename' | 'pageCount'>> {
  switch (req.op) {
    case 'merge':
      return merge(req.files);
    case 'split':
      return split(req.file, req.range);
    case 'imagesToPdf':
      return imagesToPdf(req.files);
    case 'watermark':
      return watermark(req.file, req.input);
    case 'pageNumbers':
      return pageNumbers(req.file);
    case 'protect':
      return protect(req.file, req.input);
    case 'organize':
      return organize(req.file, req.ops);
    case 'pageCount':
      return { pageCount: await pageCount(req.file) };
    default: {
      const _never: never = req;
      throw new Error(`Unknown PDF worker operation: ${JSON.stringify(_never)}`);
    }
  }
}

function post(response: WorkerResponse, transfer: ArrayBuffer[] = []): void {
  self.postMessage(response, { transfer });
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (!isRequest(data)) return;
  void (async () => {
    try {
      const result = await run(data);
      const transfer: ArrayBuffer[] = [];
      if (result.bytes) transfer.push(result.bytes);
      post(
        {
          id: data.id,
          ok: true,
          bytes: result.bytes,
          filename: result.filename,
          pageCount: result.pageCount,
        },
        transfer,
      );
    } catch (err) {
      post({ id: data.id, ok: false, message: humanError(err) });
    }
  })();
});
