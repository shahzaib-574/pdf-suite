import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pagesToDocx } from '../src/pdf/docxBuild.ts';
import { docxToPdf } from '../src/pdf/docxToPdf.ts';
import { analyzePage, clusterLines, glyphFromPdfItem } from '../src/pdf/textLayout.ts';

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

const src = await PDFDocument.create();
const page = src.addPage([595.28, 841.89]);
const font = await src.embedFont(StandardFonts.Helvetica);
page.drawText('Formatting check', { x: 72, y: 760, size: 22, font });
page.drawText('The quick brown fox jumps over the lazy dog.', {
  x: 72,
  y: 720,
  size: 12,
  font,
});
page.drawText('Second line of the same paragraph should stay together.', {
  x: 72,
  y: 704,
  size: 12,
  font,
});
page.drawText('Indented note on the right-ish left.', { x: 160, y: 660, size: 12, font });
const pdfBytes = await src.save();

const task = pdfjs.getDocument({ data: pdfBytes.slice(), useSystemFonts: true });
const pdf = await task.promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const p = await pdf.getPage(i);
  const viewport = p.getViewport({ scale: 1 });
  const content = await p.getTextContent();
  const glyphs = [];
  for (const item of content.items) {
    const g = glyphFromPdfItem(item);
    if (g) glyphs.push(g);
  }
  const lines = clusterLines(glyphs);
  const blocks = analyzePage(lines, viewport.width);
  console.log('LINES', JSON.stringify(lines, null, 2));
  console.log('BLOCKS', JSON.stringify(blocks.map((b) => b.kind)));
  pages.push({ blocks, width: viewport.width, height: viewport.height });
  p.cleanup();
}
await pdf.cleanup();
await task.destroy();

const docx = await pagesToDocx(pages);
const word = await docxToPdf({
  name: 'extracted.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: docx,
});
if (!word.ok) throw new Error(word.message);

const outTask = pdfjs.getDocument({ data: word.bytes.slice(), useSystemFonts: true });
const outPdf = await outTask.promise;
const outPage = await outPdf.getPage(1);
const viewport = outPage.getViewport({ scale: 1.6 });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const canvasContext = canvas.getContext('2d');
await outPage.render({
  canvas: canvas as unknown as HTMLCanvasElement,
  canvasContext,
  viewport,
}).promise;
const out = join(dirname(fileURLToPath(import.meta.url)), 'pdf-to-docx-preview.png');
writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`PREVIEW ${out}`);
await outPdf.cleanup();
await outTask.destroy();
