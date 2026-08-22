import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PDFDocument, StandardFonts, degrees, toDegrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
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

const fixturePath = resolve('store-assets/fixtures/ream-screenshot-fixture.pdf');
const fixtureBytes = new Uint8Array(await readFile(fixturePath));
const fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex').toUpperCase();
if (fixtureHash !== '40965B6839DC2BE1C314CF7EF70732563C7AE78BBB6E487DA1DC73F2D39875A3') {
  throw new Error(`screenshot fixture hash changed unexpectedly: ${fixtureHash}`);
}

const fixtureDocument = await PDFDocument.load(fixtureBytes);
if (fixtureDocument.getPageCount() !== 5) {
  throw new Error('screenshot fixture must contain exactly five pages');
}
if (fixtureDocument.getTitle() !== 'Ream Screenshot Fixture') {
  throw new Error('screenshot fixture title metadata is missing');
}
const fixturePages = fixtureDocument.getPages();
if (fixturePages.slice(0, 4).some((page) => page.getWidth() >= page.getHeight())) {
  throw new Error('screenshot fixture pages one through four must be portrait');
}
if (fixturePages[4].getWidth() <= fixturePages[4].getHeight()) {
  throw new Error('screenshot fixture page five must be landscape');
}

const fixtureTextTask = pdfjs.getDocument({
  data: fixtureBytes.slice(),
  useSystemFonts: true,
});
const fixtureTextDocument = await fixtureTextTask.promise;
const extractedFixturePages: string[] = [];
for (let pageNumber = 1; pageNumber <= fixtureTextDocument.numPages; pageNumber += 1) {
  const page = await fixtureTextDocument.getPage(pageNumber);
  const content = await page.getTextContent();
  extractedFixturePages.push(
    content.items
      .flatMap((item) => (typeof item === 'object' && item && 'str' in item ? [String(item.str)] : []))
      .join(' '),
  );
}
await fixtureTextTask.destroy();

const expectedFixturePhrases = [
  ['A clean document for', 'real app screenshots'],
  ['Product quality memo', 'Review workflow'],
  ['Sample inventory table', 'Item', 'Category', 'Status', 'Synthetic non-confidential'],
  ['Two-column extraction guide', 'Readable hierarchy', 'Extraction cues'],
  ['Landscape operations summary', 'Android screenshots', 'Pending'],
];
for (const [pageIndex, phrases] of expectedFixturePhrases.entries()) {
  for (const phrase of phrases) {
    if (!extractedFixturePages[pageIndex].includes(phrase)) {
      throw new Error(`screenshot fixture page ${pageIndex + 1} is missing text: ${phrase}`);
    }
  }
}

const fixtureCounted = await invoke({
  id: 0,
  op: 'pageCount',
  file: transfer('ream-screenshot-fixture.pdf', 'application/pdf', fixtureBytes),
});
if (fixtureCounted.pageCount !== 5) {
  throw new Error('PDF worker did not count all screenshot fixture pages');
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

console.log('PDF_TOOLS_SELF_CHECK_OK fixture merge split images watermark numbers organize count');
