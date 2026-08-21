import {
  createWorker,
  OEM,
  PSM,
  type Page,
  type Worker,
} from 'tesseract.js';
import type { TextGlyph } from './textTypes';

export type OcrProgress = {
  progress: number;
  status: string;
};

export type OcrPage = {
  confidence: number;
  text: string;
  glyphs: TextGlyph[];
};

export type OcrSession = {
  recognize(image: Blob, imageScale: number, pageHeightPt: number): Promise<OcrPage>;
  terminate(): Promise<void>;
};

function fallbackTextGlyphs(text: string, pageHeightPt: number): TextGlyph[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => ({
    str: line,
    x: 36,
    y: Math.max(24, pageHeightPt - 48 - index * 16),
    width: Math.min(540, line.length * 5.6),
    size: 11,
    eol: true,
    fontFamily: 'Arial',
    direction: 'ltr',
  }));
}

export function ocrPageToGlyphs(
  data: Pick<Page, 'blocks' | 'text'>,
  imageScale: number,
  pageHeightPt: number,
): TextGlyph[] {
  const scale = Math.max(0.1, imageScale);
  const glyphs: TextGlyph[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const words = (line.words ?? []).filter(
          (word) => word.text.trim().length > 0 && word.confidence >= 25,
        );
        words.forEach((word, index) => {
          const width = Math.max(1, (word.bbox.x1 - word.bbox.x0) / scale);
          const height = Math.max(1, (word.bbox.y1 - word.bbox.y0) / scale);
          glyphs.push({
            str: word.text.trim(),
            x: word.bbox.x0 / scale,
            y: pageHeightPt - word.bbox.y1 / scale,
            width,
            size: Math.max(7, Math.min(42, height * 0.82)),
            eol: index === words.length - 1,
            fontFamily: word.font_name || 'Arial',
            direction: paragraph.is_ltr === false ? 'rtl' : 'ltr',
          });
        });
      }
    }
  }
  return glyphs.length > 0 ? glyphs : fallbackTextGlyphs(data.text, pageHeightPt);
}

function localOcrAssetBase(): string {
  return new URL('ocr/', document.baseURI).href;
}

export async function createOcrSession(
  onProgress?: (update: OcrProgress) => void,
): Promise<OcrSession> {
  const assetBase = localOcrAssetBase();
  const worker: Worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${assetBase}worker.min.js`,
    corePath: assetBase,
    langPath: assetBase,
    logger(message) {
      onProgress?.({
        progress: Math.max(0, Math.min(1, message.progress ?? 0)),
        status: message.status || 'recognizing text',
      });
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '180',
  });
  return {
    async recognize(image, imageScale, pageHeightPt) {
      const result = await worker.recognize(
        image,
        { rotateAuto: true },
        { text: true, blocks: true },
      );
      return {
        confidence: result.data.confidence,
        text: result.data.text,
        glyphs: ocrPageToGlyphs(result.data, imageScale, pageHeightPt),
      };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
