import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pagesToDocx } from '../src/pdf/docxBuild.ts';
import { analyzeGlyphs, clusterLines, glyphFromPdfItem } from '../src/pdf/textLayout.ts';

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

const outputDir = resolve(process.cwd(), 'tmp/pdf-to-docx-qa');
mkdirSync(outputDir, { recursive: true });

const source = await PDFDocument.create();
const regular = await source.embedFont(StandardFonts.Helvetica);
const bold = await source.embedFont(StandardFonts.HelveticaBold);
const italic = await source.embedFont(StandardFonts.HelveticaOblique);

const page = source.addPage([595.28, 841.89]);
page.drawText('Quarterly Operations Report', { x: 72, y: 785, size: 22, font: bold });
page.drawText('Prepared for the management team', { x: 72, y: 758, size: 11, font: italic });
page.drawText('Revenue increased by 18 percent while operating costs remained stable.', {
  x: 72,
  y: 724,
  size: 11,
  font: regular,
});
page.drawText('The following summary preserves a natural wrapped paragraph in Word.', {
  x: 72,
  y: 709,
  size: 11,
  font: regular,
});
page.drawText('Key finding:', { x: 72, y: 670, size: 11, font: bold });
page.drawText(' customer retention improved in every measured region.', {
  x: 137,
  y: 670,
  size: 11,
  font: regular,
});
page.drawText('This is a separate paragraph with deliberate spacing above it.', {
  x: 72,
  y: 646,
  size: 11,
  font: regular,
});

const tableX = [72, 300, 420, 523];
const tableTop = 600;
const rowHeight = 25;
const rows = [
  ['Region', 'Orders', 'Revenue'],
  ['North', '1,240', '$84,200'],
  ['Central operations', '980', '$72,450'],
  ['South', '1,110', '$79,880'],
];
for (let row = 0; row <= rows.length; row++) {
  const y = tableTop - row * rowHeight;
  page.drawLine({
    start: { x: tableX[0]!, y },
    end: { x: tableX[3]!, y },
    thickness: 0.7,
    color: rgb(0.45, 0.45, 0.45),
  });
}
for (const x of tableX) {
  page.drawLine({
    start: { x, y: tableTop },
    end: { x, y: tableTop - rows.length * rowHeight },
    thickness: 0.7,
    color: rgb(0.45, 0.45, 0.45),
  });
}
rows.forEach((row, rowIndex) => {
  const y = tableTop - 17 - rowIndex * rowHeight;
  row.forEach((text, columnIndex) => {
    page.drawText(text, {
      x: (tableX[columnIndex] ?? 72) + 6,
      y,
      size: 10,
      font: rowIndex === 0 ? bold : regular,
    });
  });
});

page.drawText('Notes', { x: 72, y: 460, size: 15, font: bold });
page.drawText('1. Values are unaudited and shown for layout verification.', {
  x: 72,
  y: 436,
  size: 10.5,
  font: regular,
});
page.drawText('2. The output should retain headings, table geometry, and paragraph gaps.', {
  x: 72,
  y: 421,
  size: 10.5,
  font: regular,
});

const page2 = source.addPage([595.28, 841.89]);
page2.drawText('Regional commentary', { x: 72, y: 785, size: 20, font: bold });
const leftLines = [
  'North region performance remained',
  'strong throughout the quarter. The',
  'team added several repeat customers.',
];
const rightLines = [
  'South region demand accelerated late',
  'in the quarter. Delivery performance',
  'also improved against the prior year.',
];
leftLines.forEach((text, index) =>
  page2.drawText(text, { x: 72, y: 742 - index * 15, size: 10.5, font: regular }),
);
rightLines.forEach((text, index) =>
  page2.drawText(text, { x: 322, y: 742 - index * 15, size: 10.5, font: regular }),
);

const pdfBytes = await source.save();
const pdfPath = join(outputDir, 'layout-source.pdf');
writeFileSync(pdfPath, pdfBytes);

const task = pdfjs.getDocument({
  data: pdfBytes.slice(),
  useSystemFonts: true,
  fontExtraProperties: true,
});
const pdf = await task.promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const pdfPage = await pdf.getPage(i);
  const viewport = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  const styles = content.styles as Record<
    string,
    {
      fontFamily?: string;
      ascent?: number;
      descent?: number;
      vertical?: boolean;
      bold?: boolean;
      italic?: boolean;
    }
  >;
  await pdfPage.getOperatorList();
  const fontNames = Array.from(
    new Set(
      content.items.flatMap((item) =>
        typeof item === 'object' && item && 'fontName' in item
          ? [String((item as { fontName: string }).fontName)]
          : [],
      ),
    ),
  );
  for (const fontName of fontNames) {
    const object = (pdfPage as unknown as { commonObjs: { get: (id: string) => unknown } }).commonObjs.get(
      fontName,
    ) as { name?: string; fallbackName?: string; bold?: boolean; italic?: boolean };
    styles[fontName] = {
      ...(styles[fontName] ?? {}),
      fontFamily: object.name ?? object.fallbackName ?? styles[fontName]?.fontFamily,
      bold: object.bold,
      italic: object.italic,
    };
  }
  const glyphs = [];
  for (const item of content.items) {
    const glyph = glyphFromPdfItem(item, styles);
    if (glyph) glyphs.push(glyph);
  }
  const lines = clusterLines(glyphs);
  const blocks = analyzeGlyphs(glyphs, viewport.width, viewport.height);
  console.log(
    `PAGE ${i} lines=${lines.length} blocks=${blocks.map((block) => block.kind).join(',')}`,
  );
  pages.push({ blocks, width: viewport.width, height: viewport.height });
  pdfPage.cleanup();
}
await pdf.cleanup();
await task.destroy();

const docx = await pagesToDocx(pages);
const docxPath = join(outputDir, 'layout-converted.docx');
writeFileSync(docxPath, docx);
console.log(`SOURCE ${pdfPath}`);
console.log(`DOCX ${docxPath}`);
