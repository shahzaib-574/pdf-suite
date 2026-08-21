// Canvas rendering must run on the main thread (DOM canvas and toBlob).
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import jbig2FallbackUrl from 'pdfjs-dist/wasm/jbig2_nowasm_fallback.js?url';
import jbig2WasmUrl from 'pdfjs-dist/wasm/jbig2.wasm?url';
import openjpegFallbackUrl from 'pdfjs-dist/wasm/openjpeg_nowasm_fallback.js?url';
import openjpegWasmUrl from 'pdfjs-dist/wasm/openjpeg.wasm?url';
import qcmsWasmUrl from 'pdfjs-dist/wasm/qcms_bg.wasm?url';
import quickjsJsUrl from 'pdfjs-dist/wasm/quickjs-eval.js?url';
import quickjsWasmUrl from 'pdfjs-dist/wasm/quickjs-eval.wasm?url';
import type {
  CompressLevel,
  JobResult,
  PdfToDocxProgress,
  PickedFile,
} from '../lib/types';
import type { OcrSession } from './ocr';
import { analyzeGlyphs, clusterLines, glyphFromPdfItem, pageCharCount } from './textLayout';
import type { PdfTextPage } from './textTypes';
import { copyBytes, humanError } from './util';

export type { PdfTextPage };

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

const wasmAssets: Record<string, string> = {
  'jbig2.wasm': jbig2WasmUrl,
  'jbig2_nowasm_fallback.js': jbig2FallbackUrl,
  'openjpeg.wasm': openjpegWasmUrl,
  'openjpeg_nowasm_fallback.js': openjpegFallbackUrl,
  'qcms_bg.wasm': qcmsWasmUrl,
  'quickjs-eval.js': quickjsJsUrl,
  'quickjs-eval.wasm': quickjsWasmUrl,
};

const cmapAssets = import.meta.glob<string>(
  '../../node_modules/pdfjs-dist/cmaps/*',
  { query: '?url', import: 'default', eager: true, exhaustive: true },
);

const fontAssets = import.meta.glob<string>(
  '../../node_modules/pdfjs-dist/standard_fonts/*',
  { query: '?url', import: 'default', eager: true, exhaustive: true },
);

function assetUrl(map: Record<string, string>, filename: string): string | undefined {
  if (map[filename]) return map[filename];
  const suffix = `/${filename}`;
  for (const [key, url] of Object.entries(map)) {
    if (key === filename || key.endsWith(suffix)) return url;
  }
  return undefined;
}

class ViteBinaryDataFactory {
  async fetch(params: { kind: string; filename: string }): Promise<Uint8Array> {
    const { kind, filename } = params;
    const url =
      kind === 'wasmUrl'
        ? assetUrl(wasmAssets, filename)
        : kind === 'cMapUrl'
          ? assetUrl(cmapAssets, filename)
          : kind === 'standardFontDataUrl'
            ? assetUrl(fontAssets, filename)
            : undefined;
    if (!url) {
      throw new Error(`Missing on-device PDF.js asset (${kind}: ${filename}).`);
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Unable to load PDF.js asset: ${filename}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

const COMPRESS: Record<CompressLevel, { scale: number; quality: number }> = {
  strong: { scale: 0.5, quality: 0.52 },
  balanced: { scale: 0.75, quality: 0.72 },
  keep: { scale: 1, quality: 0.92 },
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode this page as JPEG.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

async function withPdfjs<T>(
  file: PickedFile,
  fn: (pdf: PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  const data = copyBytes(file.bytes);
  const task = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    useSystemFonts: true,
    fontExtraProperties: true,
    BinaryDataFactory: ViteBinaryDataFactory,
  });
  const pdf = await task.promise;
  try {
    return await fn(pdf);
  } finally {
    await pdf.cleanup();
    await task.destroy();
  }
}

async function renderPageToJpeg(
  page: PDFPageProxy,
  scale: number,
  quality: number,
): Promise<Blob> {
  const viewport = page.getViewport({ scale: Math.max(scale, 0.05) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const canvasContext = canvas.getContext('2d', { alpha: false });
  if (!canvasContext) {
    throw new Error('Could not create a canvas to render this page.');
  }
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext, viewport });
  try {
    await task.promise;
    return await canvasToJpeg(canvas, quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

export async function renderPage(
  file: PickedFile,
  pageIndex: number,
  width: number,
): Promise<Blob> {
  return withPdfjs(file, async (pdf) => {
    if (pageIndex < 0 || pageIndex >= pdf.numPages) {
      throw new Error('That page is out of range.');
    }
    const page = await pdf.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = base.width > 0 ? width / base.width : 1;
    return renderPageToJpeg(page, scale, 0.82);
  });
}

export async function pdfToImages(file: PickedFile): Promise<JobResult> {
  try {
    return await withPdfjs(file, async (pdf) => {
      if (pdf.numPages < 1) {
        return { ok: false, message: 'This PDF has no pages to export.' };
      }
      const images: Blob[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        images.push(await renderPageToJpeg(page, 2, 0.82));
      }
      return {
        ok: true,
        bytes: new Uint8Array(),
        filename: `${file.name.replace(/\.pdf$/i, '') || 'document'}-pages`,
        pageCount: pdf.numPages,
        mime: 'application/x-image-set',
        extra: { images },
      };
    });
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}

export async function compress(
  file: PickedFile,
  level: CompressLevel,
): Promise<JobResult> {
  try {
    const { scale, quality } = COMPRESS[level];
    return await withPdfjs(file, async (pdf) => {
      if (pdf.numPages < 1) {
        return { ok: false, message: 'This PDF has no pages to compress.' };
      }
      const out = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const jpeg = await renderPageToJpeg(page, scale, quality);
        const image = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
        const pdfPage = out.addPage([base.width, base.height]);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width: base.width,
          height: base.height,
        });
      }
      const bytes = await out.save();
      const compressed = copyBytes(bytes);
      const finalBytes =
        compressed.byteLength < file.bytes.byteLength ? compressed : copyBytes(file.bytes);
      return {
        ok: true,
        bytes: finalBytes,
        filename: 'compressed.pdf',
        pageCount: out.getPageCount(),
        mime: 'application/pdf',
      };
    });
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}

export async function extractPdfText(
  file: PickedFile,
  onProgress?: (update: PdfToDocxProgress) => void,
): Promise<PdfTextPage[]> {
  return withPdfjs(file, async (pdf) => {
    if (pdf.numPages < 1) return [];
    const pages: PdfTextPage[] = [];
    let ocr: OcrSession | undefined;
    let ocrUnavailable = false;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress?.({
          progress: (i - 1) / pdf.numPages,
          label: `Reading page ${i} of ${pdf.numPages}`,
        });
        const page = await pdf.getPage(i);
        try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        await page.getOperatorList();
        const styles = { ...content.styles } as Record<
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
        const fontNames = new Set<string>();
        for (const item of content.items) {
          if (typeof item === 'object' && item && 'fontName' in item) {
            const fontName = (item as { fontName?: unknown }).fontName;
            if (typeof fontName === 'string') fontNames.add(fontName);
          }
        }
        for (const fontName of fontNames) {
          try {
            const font = page.commonObjs.get(fontName) as {
              name?: string;
              fallbackName?: string;
              bold?: boolean;
              italic?: boolean;
            };
            const previous = styles[fontName] ?? {};
            styles[fontName] = {
              ...previous,
              fontFamily: font.name ?? font.fallbackName ?? previous.fontFamily,
              bold: font.bold,
              italic: font.italic,
            };
          } catch {
            // Some malformed PDFs omit a resolvable font object; keep text extraction usable.
          }
        }
        const glyphs = [];
        for (const item of content.items) {
          const glyph = glyphFromPdfItem(item, styles);
          if (glyph) glyphs.push(glyph);
        }
        const lines = clusterLines(glyphs);
        const chars = pageCharCount(lines);
        if (chars >= 12) {
          pages.push({
            width: viewport.width,
            height: viewport.height,
            blocks: analyzeGlyphs(glyphs, viewport.width, viewport.height),
          });
          continue;
        }

        const ocrScale = Math.max(1.5, Math.min(2.6, 1800 / viewport.width));
        const jpeg = await renderPageToJpeg(page, ocrScale, 0.9);
        let recognized = false;
        if (!ocrUnavailable) {
          try {
            if (!ocr) {
              onProgress?.({
                progress: (i - 0.9) / pdf.numPages,
                label: 'Starting on-device OCR',
              });
              const module = await import('./ocr');
              ocr = await module.createOcrSession((update) => {
                onProgress?.({
                  progress: (i - 1 + update.progress * 0.9) / pdf.numPages,
                  label: `OCR page ${i} of ${pdf.numPages}`,
                });
              });
            }
            const result = await ocr.recognize(jpeg, ocrScale, viewport.height);
            const ocrChars = result.text.replace(/\s/g, '').length;
            if (result.confidence >= 45 && ocrChars >= 10) {
              const blocks = analyzeGlyphs(
                result.glyphs,
                viewport.width,
                viewport.height,
              );
              if (blocks.length > 0) {
                pages.push({
                  width: viewport.width,
                  height: viewport.height,
                  blocks,
                });
                recognized = true;
              }
            }
          } catch {
            ocrUnavailable = true;
          }
        }
        if (!recognized) {
          pages.push({
            width: viewport.width,
            height: viewport.height,
            blocks: [
              {
                kind: 'image',
                bytes: new Uint8Array(await jpeg.arrayBuffer()),
                mime: 'image/jpeg',
                widthPt: viewport.width,
                heightPt: viewport.height,
              },
            ],
          });
        }
        } finally {
          page.cleanup();
        }
      }
    } finally {
      await ocr?.terminate();
    }
    onProgress?.({ progress: 0.96, label: 'Building Word document' });
    return pages;
  });
}
