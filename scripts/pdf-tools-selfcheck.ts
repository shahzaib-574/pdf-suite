import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PDFDocument, StandardFonts, degrees, toDegrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildDocx,
  buildMinimalDocx,
  documentXml,
  paragraphXml,
} from '../src/pdf/docxToPdf.test.ts';
import type { TransferFile, WorkerRequest } from '../src/pdf/protocol.ts';
import { runWorkerOperation } from '../src/pdf/worker.ts';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

const protectedPdf = await invoke({
  id: 9,
  op: 'protect',
  file: transfer('first.pdf', 'application/pdf', first),
  input: { userPassword: 'ream-test' },
});
if (!protectedPdf.bytes || protectedPdf.filename !== 'protected.pdf') {
  throw new Error('protect did not return protected.pdf');
}
const encryptedBytes = new Uint8Array(protectedPdf.bytes);
if (
  encryptedBytes.length < 4 ||
  encryptedBytes[0] !== 0x25 ||
  encryptedBytes[1] !== 0x50 ||
  encryptedBytes[2] !== 0x44 ||
  encryptedBytes[3] !== 0x46
) {
  throw new Error('protect output does not start with %PDF');
}
const encryptedLatin1 = new TextDecoder('latin1').decode(encryptedBytes);
if (!encryptedLatin1.includes('/Encrypt') || !encryptedLatin1.includes('/AESV3')) {
  throw new Error('protect output is missing AES-256 encryption dictionaries');
}
let loadedWithoutPassword = false;
try {
  await PDFDocument.load(encryptedBytes);
  loadedWithoutPassword = true;
} catch {
  // EncryptedPDFError (or equivalent) is required.
}
if (loadedWithoutPassword) {
  throw new Error('encrypted PDF loaded in pdf-lib without a password');
}

let rejectedEmptyPassword = false;
try {
  await invoke({
    id: 10,
    op: 'protect',
    file: transfer('first.pdf', 'application/pdf', first),
    input: { userPassword: '   ' },
  });
} catch (err) {
  rejectedEmptyPassword =
    err instanceof Error && err.message === 'Enter a password to protect this PDF.';
}
if (!rejectedEmptyPassword) {
  throw new Error('protect accepted an empty password');
}

let rejectedUnsupportedImage = false;
try {
  await invoke({
    id: 11,
    op: 'imagesToPdf',
    files: [transfer('pixel.gif', 'image/gif', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))],
  });
} catch (err) {
  rejectedUnsupportedImage =
    err instanceof Error &&
    err.message.includes('JPEG') &&
    err.message.includes('PNG') &&
    err.message.includes('WebP');
}
if (!rejectedUnsupportedImage) {
  throw new Error('imagesToPdf error did not mention JPEG, PNG, and WebP');
}

const canDecodeWebp =
  typeof Blob === 'function' &&
  typeof createImageBitmap === 'function' &&
  typeof OffscreenCanvas === 'function';
if (canDecodeWebp) {
  const webp = Uint8Array.from(
    Buffer.from(
      'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
      'base64',
    ),
  );
  const webpPdf = await invoke({
    id: 12,
    op: 'imagesToPdf',
    files: [transfer('pixel.webp', 'image/webp', webp)],
  });
  if (!webpPdf.bytes || webpPdf.pageCount !== 1) {
    throw new Error('WebP image conversion failed');
  }
}

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

const namedDocx = await invoke({
  id: 13,
  op: 'docxToPdf',
  file: transfer(
    'Invoice-2024.docx',
    DOCX_MIME,
    await buildMinimalDocx(['Named from worker']),
  ),
});
if (
  !namedDocx.bytes ||
  namedDocx.filename !== 'Invoice-2024.pdf' ||
  (namedDocx.pageCount ?? 0) < 1
) {
  throw new Error(
    `docxToPdf worker op failed: ${JSON.stringify({
      filename: namedDocx.filename,
      pageCount: namedDocx.pageCount,
    })}`,
  );
}
const namedHeader = new Uint8Array(namedDocx.bytes).slice(0, 4);
if (
  namedHeader[0] !== 0x25 ||
  namedHeader[1] !== 0x50 ||
  namedHeader[2] !== 0x44 ||
  namedHeader[3] !== 0x46
) {
  throw new Error('docxToPdf worker output does not start with %PDF');
}
if (namedDocx.extra?.wordToPdf?.warnings?.length) {
  throw new Error('Latin-only worker conversion must not attach glyph warnings');
}

let rejectedUnsupportedCharacters = false;
try {
  await invoke({ id: 14, op: 'docxToPdf', file: transfer('cjk.docx', DOCX_MIME, await buildDocx({ documentXml: documentXml(paragraphXml('你好世界')) })) });
} catch (error) { rejectedUnsupportedCharacters = error instanceof Error && error.message.includes('cannot preserve'); }
if (!rejectedUnsupportedCharacters) throw new Error('Word conversion must reject unsupported characters rather than replace them.');

let rejectedBadDocx = false;
try {
  await invoke({
    id: 15,
    op: 'docxToPdf',
    file: transfer('nope.txt', 'text/plain', Uint8Array.from([1, 2, 3, 4])),
  });
} catch (err) {
  rejectedBadDocx = err instanceof Error && /docx/i.test(err.message);
}
if (!rejectedBadDocx) {
  throw new Error('docxToPdf worker accepted a non-docx payload');
}

console.log(
  'PDF_TOOLS_SELF_CHECK_OK fixture merge split images watermark numbers organize count protect docx',
);
