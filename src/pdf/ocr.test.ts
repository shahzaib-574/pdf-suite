import type { Page } from 'tesseract.js';
import { pagesToDocx } from './docxBuild';
import { ocrPageToGlyphs } from './ocr';
import { analyzeGlyphs } from './textLayout';

export async function runOcrLayoutSelfCheck(): Promise<void> {
  const word = (text: string, confidence: number, x0: number, y0: number, x1: number, y1: number) => ({
    text,
    confidence,
    bbox: { x0, y0, x1, y1 },
    font_name: 'Arial',
    symbols: [],
    choices: [],
  });
  const line = (words: ReturnType<typeof word>[]) => ({ words });
  const data = {
    text: 'Region Orders Revenue\nNorth 1240 84200',
    blocks: [
      {
        paragraphs: [
          {
            is_ltr: true,
            lines: [
              line([
                word('Region', 96, 100, 200, 260, 250),
                word('Orders', 97, 600, 200, 750, 250),
                word('Revenue', 97, 900, 200, 1080, 250),
              ]),
              line([
                word('North', 95, 100, 300, 230, 350),
                word('1240', 96, 600, 300, 700, 350),
                word('84200', 96, 900, 300, 1030, 350),
              ]),
            ],
          },
        ],
      },
    ],
  } as unknown as Pick<Page, 'blocks' | 'text'>;
  const glyphs = ocrPageToGlyphs(data, 2, 792);
  if (glyphs.length !== 6 || Math.abs((glyphs[0]?.x ?? 0) - 50) > 0.1) {
    throw new Error(`OCR geometry mapping failed: ${JSON.stringify(glyphs)}`);
  }
  const blocks = analyzeGlyphs(glyphs, 612, 792);
  const table = blocks.find((block) => block.kind === 'table');
  if (!table || table.rows[1]?.[0] !== 'North') {
    throw new Error(`OCR table reconstruction failed: ${JSON.stringify(blocks)}`);
  }
  const docx = await pagesToDocx([{ width: 612, height: 792, blocks }]);
  if (docx.byteLength < 1000) throw new Error('OCR DOCX packaging failed');
}
