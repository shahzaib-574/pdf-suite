import type {
  JobResult,
  PdfToDocxProgress,
  PdfToDocxReport,
  PickedFile,
} from "../lib/types";
import { DOCX_MIME, pagesToDocx } from "./docxBuild";
import type { PdfBlock, PdfTextPage } from "./textTypes";
import { humanError } from "./util";
import { ocrLanguageLabel, type OcrLanguage } from '../lib/ocrLanguages';

function docxNameFromPdf(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document";
  const stem = base.replace(/\.pdf$/i, "").trim() || "document";
  return `${stem}.docx`;
}

function countBlocks(
  blocks: PdfBlock[],
  totals: { tables: number; columnGroups: number; images: number },
): void {
  for (const block of blocks) {
    if (block.kind === "table") totals.tables += 1;
    else if (block.kind === "image") totals.images += 1;
    else if (block.kind === "columns") {
      totals.columnGroups += 1;
      block.columns.forEach((column) => countBlocks(column, totals));
    }
  }
}

function conversionReport(pages: PdfTextPage[], language: OcrLanguage): PdfToDocxReport {
  const totals = { tables: 0, columnGroups: 0, images: 0 };
  pages.forEach((page) => countBlocks(page.blocks, totals));
  const imageOnlyPages = pages.filter(
    (page) =>
      page.blocks.length > 0 &&
      page.blocks.every((block) => block.kind === "image"),
  ).length;
  const warnings: string[] = [];
  const ocrPages = pages.flatMap((page, i) =>
    page.ocrConfidence != null ? [i + 1] : [],
  );
  if (ocrPages.length)
    warnings.push(
      `${ocrLanguageLabel(language)} OCR was used on pages ${ocrPages.join(", ")}. Check names, numbers, and diagrams against the original; recognition is not guaranteed.`,
    );
  if (imageOnlyPages > 0) {
    warnings.push(
      `${imageOnlyPages} page${imageOnlyPages === 1 ? "" : "s"} used a full-page image fallback because editable text could not be extracted confidently.`,
    );
  }
  return {
    editablePages: Math.max(0, pages.length - imageOnlyPages),
    imageOnlyPages,
    imageOnlyPageNumbers: pages.flatMap((page,index) => page.blocks.length && page.blocks.every(block=>block.kind==='image') ? [index+1] : []),
    tables: totals.tables,
    columnGroups: totals.columnGroups,
    images: totals.images,
    warnings,
  };
}

export async function pdfToDocx(
  file: PickedFile,
  onProgress?: (update: PdfToDocxProgress) => void,
  signal?: AbortSignal,
  language: OcrLanguage = 'eng',
): Promise<JobResult> {
  try {
    const { extractPdfText } = await import("./render");
    const pages = await extractPdfText(file, onProgress, signal, language);
    signal?.throwIfAborted();
    const bytes = await pagesToDocx(pages);
    signal?.throwIfAborted();
    onProgress?.({ progress: 1, label: "Word document ready" });
    return {
      ok: true,
      bytes,
      filename: docxNameFromPdf(file.name),
      pageCount: Math.max(1, pages.length),
      mime: DOCX_MIME,
      extra: { pdfToDocx: conversionReport(pages, language) },
    };
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}
