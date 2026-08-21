import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocx,
  documentXml,
  paragraphXml,
  runDocxToPdfSelfCheck,
} from '../src/pdf/docxToPdf.test.ts';
import { runPagesToDocxSelfCheck } from '../src/pdf/docxBuild.test.ts';
import { docxToPdf } from '../src/pdf/docxToPdf.ts';
import { pickedDocx } from '../src/pdf/docxToPdf.test.ts';
import { runOcrLayoutSelfCheck } from '../src/pdf/ocr.test.ts';

await runDocxToPdfSelfCheck();
await runPagesToDocxSelfCheck();
await runOcrLayoutSelfCheck();

const sample = await buildDocx({
  documentXml: documentXml(
    paragraphXml('Ream - PDF Suite', { style: 'Heading1' }) +
      paragraphXml('On-device Word to PDF self-check.') +
      paragraphXml('Bold line', { bold: true }) +
      paragraphXml('A listed item', { list: true }),
  ),
});
const result = await docxToPdf(pickedDocx(sample, 'ream-sample.docx'));
if (!result.ok) {
  throw new Error(result.message);
}
const header = String.fromCharCode(...result.bytes.slice(0, 4));
if (header !== '%PDF') {
  throw new Error(`expected %PDF header, got ${JSON.stringify(header)}`);
}
const outDir = dirname(fileURLToPath(import.meta.url));
const outPath = join(outDir, 'selfcheck-document.pdf');
writeFileSync(outPath, result.bytes);
console.log(
  `SELF_CHECK_OK pages=${result.pageCount ?? '?'} bytes=${result.bytes.byteLength} wrote=${outPath}`,
);
console.log('PDF_TO_DOCX_PACKAGER_OK');
console.log('OCR_LAYOUT_PACKAGER_OK');
