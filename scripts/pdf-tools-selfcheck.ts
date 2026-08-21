import { PDFDocument, StandardFonts, degrees, toDegrees } from 'pdf-lib';
import type { TransferFile, WorkerRequest } from '../src/pdf/protocol.ts';
import { runWorkerOperation } from '../src/pdf/worker.ts';

function transfer(name: string, mime: string, bytes: Uint8Array): TransferFile {
  return {
    name,
    mime,
    bytes: bytes.slice().buffer as ArrayBuffer,
  };
}

async function samplePdf(pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index++) {
    const page = document.addPage([320 + index * 10, 480]);
    page.drawText(`Source page ${index + 1}`, { x: 30, y: 420, size: 16, font });
  }
  return document.save();
}

async function invoke(request: WorkerRequest) {
  return runWorkerOperation(request);
}

const first = await samplePdf(2);
const second = await samplePdf(1);
const merged = await invoke({
  id: 1,
  op: 'merge',
  files: [transfer('first.pdf', 'application/pdf', first), transfer('second.pdf', 'application/pdf', second)],
});
if (merged.pageCount !== 3 || !merged.bytes) throw new Error('merge did not create three pages');

const split = await invoke({
  id: 2,
  op: 'split',
  file: transfer('merged.pdf', 'application/pdf', new Uint8Array(merged.bytes)),
  range: { start: 2, end: 3 },
});
if (split.pageCount !== 2) throw new Error('split did not preserve the selected range');

const organized = await invoke({
  id: 3,
  op: 'organize',
  file: transfer('first.pdf', 'application/pdf', first),
  ops: [
    { type: 'reorder', order: [1, 0] },
    { type: 'rotate', pageIndex: 0, degrees: 90 },
  ],
});
if (!organized.bytes || organized.pageCount !== 2) throw new Error('organize failed');
const organizedPdf = await PDFDocument.load(organized.bytes);
if (toDegrees(organizedPdf.getPage(0).getRotation()) !== 90) {
  throw new Error('organize did not rotate the reordered page');
}
if (organizedPdf.getPage(0).getWidth() !== 330) {
  throw new Error('organize did not apply the requested page order');
}

const watermark = await invoke({
  id: 4,
  op: 'watermark',
  file: transfer('first.pdf', 'application/pdf', first),
  input: { text: 'DRAFT', opacity: 0.2 },
});
const numbered = await invoke({
  id: 5,
  op: 'pageNumbers',
  file: transfer('first.pdf', 'application/pdf', first),
});
if (!watermark.bytes || watermark.pageCount !== 2) throw new Error('watermark failed');
if (!numbered.bytes || numbered.pageCount !== 2) throw new Error('page numbers failed');

const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);
const images = await invoke({
  id: 6,
  op: 'imagesToPdf',
  files: [transfer('pixel.png', 'image/png', png)],
});
if (!images.bytes || images.pageCount !== 1) throw new Error('image conversion failed');

const counted = await invoke({
  id: 7,
  op: 'pageCount',
  file: transfer('first.pdf', 'application/pdf', first),
});
if (counted.pageCount !== 2) throw new Error('page count failed');

let rejectedEmpty = false;
try {
  await invoke({
    id: 8,
    op: 'organize',
    file: transfer('first.pdf', 'application/pdf', first),
    ops: [{ type: 'reorder', order: [] }],
  });
} catch {
  rejectedEmpty = true;
}
if (!rejectedEmpty) throw new Error('organize accepted a zero-page output');

// Confirm pdf-lib continues to round-trip existing page rotations used by organize.
const rotationCheck = await PDFDocument.create();
rotationCheck.addPage().setRotation(degrees(180));
if (toDegrees(rotationCheck.getPage(0).getRotation()) !== 180) {
  throw new Error('PDF rotation primitive is unavailable');
}

console.log('PDF_TOOLS_SELF_CHECK_OK merge split images watermark numbers organize count');
