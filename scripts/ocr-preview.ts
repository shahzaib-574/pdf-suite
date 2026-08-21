import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { pagesToDocx } from '../src/pdf/docxBuild.ts';
import { ocrPageToGlyphs } from '../src/pdf/ocr.ts';
import { analyzeGlyphs } from '../src/pdf/textLayout.ts';

const root = resolve(import.meta.dirname, '..');
const imagePath = resolve(root, 'tmp/ocr-qa/scanned-page.png');
const outputPath = resolve(root, 'tmp/ocr-qa/scanned-converted.docx');
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: resolve(root, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int'),
});
try {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '180',
  });
  const result = await worker.recognize(
    imagePath,
    { rotateAuto: true },
    { text: true, blocks: true },
  );
  const glyphs = ocrPageToGlyphs(result.data, 1275 / 612, 792);
  const blocks = analyzeGlyphs(glyphs, 612, 792);
  if (result.data.confidence < 45 || result.data.text.replace(/\s/g, '').length < 10) {
    throw new Error(`OCR confidence was too low: ${result.data.confidence}`);
  }
  const required = ['SCANNED OPERATIONS REPORT', 'North', '1,240', '84,200'];
  for (const expected of required) {
    if (!result.data.text.includes(expected)) {
      throw new Error(`OCR output is missing ${JSON.stringify(expected)}`);
    }
  }
  const bytes = await pagesToDocx([{ width: 612, height: 792, blocks }]);
  writeFileSync(outputPath, bytes);
  console.log(
    `OCR_PREVIEW_OK confidence=${result.data.confidence.toFixed(1)} glyphs=${glyphs.length} blocks=${blocks.map((block) => block.kind).join(',')}`,
  );
  console.log(
    JSON.stringify(
      blocks.map((block) =>
        block.kind === 'table'
          ? { kind: block.kind, rows: block.rows, top: block.top, bottom: block.bottom }
          : { kind: block.kind, top: block.kind === 'image' ? undefined : block.top },
      ),
      null,
      2,
    ),
  );
  console.log(result.data.text.trim());
  console.log(outputPath);
} finally {
  await worker.terminate();
}
