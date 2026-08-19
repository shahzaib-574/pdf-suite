import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  buildDocx,
  documentXml,
  paragraphXml,
  pickedDocx,
} from '../src/pdf/docxToPdf.test.ts';
import { docxToPdf } from '../src/pdf/docxToPdf.ts';

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

const sect =
  '<w:sectPr>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="2160" w:right="1440" w:bottom="1440" w:left="1440"/>' +
  '</w:sectPr>';

const xml = documentXml(
  '<w:p/>' +
    '<w:p/>' +
    paragraphXml('Title at the top', { style: 'Heading1' }) +
    paragraphXml('Body after two blank lines and heading space.') +
    '<w:tbl><w:tblPr><w:tblBorders>' +
    '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>' +
    '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>' +
    '</w:tblBorders></w:tblPr>' +
    '<w:tr><w:tc>' +
    paragraphXml('No border cell') +
    '</w:tc><w:tc>' +
    paragraphXml('Second cell') +
    '</w:tc></w:tr></w:tbl>' +
    sect,
);

const result = await docxToPdf(pickedDocx(await buildDocx({ documentXml: xml }), 'spacing.docx'));
if (!result.ok) {
  throw new Error(result.message);
}

const task = pdfjs.getDocument({
  data: result.bytes.slice(),
  useSystemFonts: true,
  isOffscreenCanvasSupported: false,
});
const pdf = await task.promise;
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 1.6 });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const canvasContext = canvas.getContext('2d');
await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext, viewport })
  .promise;
const out = join(dirname(fileURLToPath(import.meta.url)), 'spacing-preview.png');
writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`PREVIEW ${out} pages=${pdf.numPages} pdfBytes=${result.bytes.byteLength}`);
await pdf.cleanup();
await task.destroy();
