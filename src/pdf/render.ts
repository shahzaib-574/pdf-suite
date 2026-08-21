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
import {
  analyzeGlyphs,
  clusterLines,
  glyphFromPdfItem,
  orderAndSpaceBlocks,
  pageCharCount,
  rulingsFromOperatorList,
} from './textLayout';
import type { PdfBlock, PdfTextPage } from './textTypes';
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

export type PdfViewerPage = {
  width: number;
  height: number;
  text: string;
};

export type PdfViewerOutlineItem = {
  title: string;
  pageIndex: number;
  depth: number;
};

export type PdfViewerDocument = {
  pageCount: number;
  pages: PdfViewerPage[];
  outline: PdfViewerOutlineItem[];
};

export type PdfViewerTextLayer = {
  cancel(): void;
  textDivs: HTMLElement[];
  textItems: string[];
};

export type PdfViewerSession = {
  document: PdfViewerDocument;
  renderPage(pageIndex: number, width: number): Promise<Blob>;
  renderTextLayer(
    pageIndex: number,
    container: HTMLElement,
    scale: number,
  ): Promise<PdfViewerTextLayer>;
  destroy(): Promise<void>;
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
  const task = createPdfTask(file);
  const pdf = await task.promise;
  try {
    return await fn(pdf);
  } finally {
    await pdf.cleanup();
    await task.destroy();
  }
}

function createPdfTask(file: PickedFile) {
  return pdfjs.getDocument({
    data: copyBytes(file.bytes),
    useWorkerFetch: false,
    useSystemFonts: true,
    fontExtraProperties: true,
    BinaryDataFactory: ViteBinaryDataFactory,
  });
}

type RawOutlineItem = {
  title?: unknown;
  dest?: unknown;
  items?: unknown;
};

async function outlinePageIndex(
  pdf: PDFDocumentProxy,
  destination: unknown,
): Promise<number | undefined> {
  let resolved = destination;
  if (typeof resolved === 'string') {
    resolved = await pdf.getDestination(resolved);
  }
  if (!Array.isArray(resolved) || resolved.length === 0) return undefined;
  const pageRef = resolved[0];
  if (typeof pageRef === 'number') {
    return pageRef >= 0 && pageRef < pdf.numPages ? pageRef : undefined;
  }
  if (typeof pageRef !== 'object' || pageRef === null) return undefined;
  try {
    return await pdf.getPageIndex(
      pageRef as Parameters<PDFDocumentProxy['getPageIndex']>[0],
    );
  } catch {
    return undefined;
  }
}

async function flattenOutline(
  pdf: PDFDocumentProxy,
  items: unknown,
  depth = 0,
): Promise<PdfViewerOutlineItem[]> {
  if (!Array.isArray(items)) return [];
  const flattened: PdfViewerOutlineItem[] = [];
  for (const value of items) {
    if (typeof value !== 'object' || value === null) continue;
    const item = value as RawOutlineItem;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const pageIndex = await outlinePageIndex(pdf, item.dest);
    if (title && pageIndex != null) {
      flattened.push({ title, pageIndex, depth: Math.min(depth, 3) });
    }
    flattened.push(...(await flattenOutline(pdf, item.items, depth + 1)));
  }
  return flattened;
}

function textOf(content: Awaited<ReturnType<PDFPageProxy['getTextContent']>>): string {
  return content.items
    .map((item) =>
      typeof item === 'object' && item && 'str' in item && typeof item.str === 'string'
        ? item.str
        : '',
    )
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function openPdfViewer(
  file: PickedFile,
  onProgress?: (current: number, total: number) => void,
): Promise<PdfViewerSession> {
  const task = createPdfTask(file);
  const pdf = await task.promise;
  let destroyed = false;
  try {
    const pages: PdfViewerPage[] = [];
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        width: viewport.width,
        height: viewport.height,
        text: textOf(content),
      });
      page.cleanup();
      onProgress?.(pageIndex + 1, pdf.numPages);
    }
    const outline = await flattenOutline(pdf, await pdf.getOutline());
    const viewerDocument: PdfViewerDocument = {
      pageCount: pdf.numPages,
      pages,
      outline,
    };

    return {
      document: viewerDocument,
      async renderPage(pageIndex, width) {
        if (destroyed) throw new Error('This viewer session is closed.');
        if (pageIndex < 0 || pageIndex >= pdf.numPages) {
          throw new Error('That page is out of range.');
        }
        const page = await pdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const scale = base.width > 0 ? Math.max(0.1, width / base.width) : 1;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const canvasContext = canvas.getContext('2d', { alpha: false });
        if (!canvasContext) {
          throw new Error('Could not create a canvas to render this page.');
        }
        canvasContext.fillStyle = '#ffffff';
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        const renderTask = page.render({ canvas, canvasContext, viewport });
        try {
          await renderTask.promise;
          return await canvasToJpeg(canvas, 0.9);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      },
      async renderTextLayer(pageIndex, container, scale) {
        if (destroyed) throw new Error('This viewer session is closed.');
        if (pageIndex < 0 || pageIndex >= pdf.numPages) {
          throw new Error('That page is out of range.');
        }
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: Math.max(0.1, scale) });
        const textContent = await page.getTextContent();
        const layer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container,
          viewport,
        });
        await layer.render();
        return {
          cancel: () => layer.cancel(),
          textDivs: layer.textDivs,
          textItems: layer.textContentItemsStr,
        };
      },
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        await pdf.cleanup();
        await task.destroy();
      },
    };
  } catch (error) {
    await pdf.cleanup();
    await task.destroy();
    throw error;
  }
}

async function renderPageToJpeg(
  page: PDFPageProxy,
  scale: number,
  quality: number,
): Promise<Blob> {
  const canvas = await renderPageCanvas(page, scale);
  try {
    return await canvasToJpeg(canvas, quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

async function renderPageCanvas(
  page: PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
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
    return canvas;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
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

type PdfOperatorList = Awaited<ReturnType<PDFPageProxy['getOperatorList']>>;
type Matrix = [number, number, number, number, number, number];
type ImagePlacement = { x: number; top: number; bottom: number; width: number; height: number };

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function imagePlacementsFromOperatorList(
  operatorList: PdfOperatorList,
  viewport: ReturnType<PDFPageProxy['getViewport']>,
): ImagePlacement[] {
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const imageOps = new Set<number>(
    [
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
    ].filter((value): value is number => typeof value === 'number'),
  );
  const identity: Matrix = [1, 0, 0, 1, 0, 0];
  let transform: Matrix = identity;
  const stack: Matrix[] = [];
  const placements: ImagePlacement[] = [];
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const op = operatorList.fnArray[index];
    if (op === pdfjs.OPS.save) {
      stack.push([...transform] as Matrix);
      continue;
    }
    if (op === pdfjs.OPS.restore) {
      transform = stack.pop() ?? identity;
      continue;
    }
    if (op === pdfjs.OPS.transform) {
      const args = operatorList.argsArray[index];
      if (Array.isArray(args) && args.length >= 6) {
        const next = args.slice(0, 6).map(Number) as Matrix;
        if (next.every(Number.isFinite)) transform = multiplyMatrix(transform, next);
      }
      continue;
    }
    if (!imageOps.has(op)) continue;
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) => ({
      x: transform[0] * x! + transform[2] * y! + transform[4],
      y: transform[1] * x! + transform[3] * y! + transform[5],
    }));
    const sourceLeft = Math.min(...corners.map((corner) => corner.x));
    const sourceRight = Math.max(...corners.map((corner) => corner.x));
    const sourceBottom = Math.min(...corners.map((corner) => corner.y));
    const sourceTop = Math.max(...corners.map((corner) => corner.y));
    const viewportCorners = [
      viewport.convertToViewportPoint(sourceLeft, sourceBottom),
      viewport.convertToViewportPoint(sourceRight, sourceBottom),
      viewport.convertToViewportPoint(sourceLeft, sourceTop),
      viewport.convertToViewportPoint(sourceRight, sourceTop),
    ];
    const left = Math.max(0, Math.min(...viewportCorners.map((point) => Number(point[0]))));
    const right = Math.min(pageWidth, Math.max(...viewportCorners.map((point) => Number(point[0]))));
    const viewportTop = Math.max(
      0,
      Math.min(...viewportCorners.map((point) => Number(point[1]))),
    );
    const viewportBottom = Math.min(
      pageHeight,
      Math.max(...viewportCorners.map((point) => Number(point[1]))),
    );
    const top = pageHeight - viewportTop;
    const bottom = pageHeight - viewportBottom;
    const width = right - left;
    const height = top - bottom;
    const areaRatio = (width * height) / Math.max(1, pageWidth * pageHeight);
    if (width < 16 || height < 16 || areaRatio > 0.72) continue;
    if (
      placements.some(
        (item) =>
          Math.abs(item.x - left) < 2 &&
          Math.abs(item.top - top) < 2 &&
          Math.abs(item.width - width) < 2 &&
          Math.abs(item.height - height) < 2,
      )
    ) {
      continue;
    }
    placements.push({ x: left, top, bottom, width, height });
  }
  return placements.slice(0, 16);
}

async function extractPlacedImages(
  page: PDFPageProxy,
  placements: ImagePlacement[],
  pageWidth: number,
  pageHeight: number,
): Promise<PdfBlock[]> {
  if (placements.length === 0) return [];
  const scale = Math.max(1.4, Math.min(2.4, 1800 / Math.max(1, pageWidth)));
  const canvas = await renderPageCanvas(page, scale);
  try {
    const blocks: PdfBlock[] = [];
    for (const placement of placements) {
      const sx = Math.max(0, Math.floor(placement.x * scale));
      const sy = Math.max(0, Math.floor((pageHeight - placement.top) * scale));
      const sw = Math.min(canvas.width - sx, Math.max(1, Math.ceil(placement.width * scale)));
      const sh = Math.min(canvas.height - sy, Math.max(1, Math.ceil(placement.height * scale)));
      if (sw < 2 || sh < 2) continue;
      const crop = document.createElement('canvas');
      crop.width = sw;
      crop.height = sh;
      const context = crop.getContext('2d', { alpha: false });
      if (!context) continue;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, sw, sh);
      context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      try {
        const jpeg = await canvasToJpeg(crop, 0.9);
        blocks.push({
          kind: 'image',
          bytes: new Uint8Array(await jpeg.arrayBuffer()),
          mime: 'image/jpeg',
          widthPt: placement.width,
          heightPt: placement.height,
          x: placement.x,
          top: placement.top,
          bottom: placement.bottom,
        });
      } finally {
        crop.width = 0;
        crop.height = 0;
      }
    }
    return blocks;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
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
        const operatorList = await page.getOperatorList();
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
          const rulings = rulingsFromOperatorList(
            operatorList,
            pdfjs.OPS.constructPath,
          );
          const textBlocks = analyzeGlyphs(
            glyphs,
            viewport.width,
            viewport.height,
            rulings,
          );
          let imageBlocks: PdfBlock[] = [];
          const placements = imagePlacementsFromOperatorList(
            operatorList,
            viewport,
          );
          if (placements.length > 0) {
            onProgress?.({
              progress: (i - 0.35) / pdf.numPages,
              label: `Preserving images on page ${i} of ${pdf.numPages}`,
            });
            try {
              imageBlocks = await extractPlacedImages(
                page,
                placements,
                viewport.width,
                viewport.height,
              );
            } catch {
              // Keep the editable text conversion usable if a malformed image cannot render.
            }
          }
          pages.push({
            width: viewport.width,
            height: viewport.height,
            blocks: orderAndSpaceBlocks(
              [...textBlocks, ...imageBlocks],
              viewport.height,
            ),
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
