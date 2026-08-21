import type { JobResult, PdfToDocxProgress, PickedFile } from '../lib/types';
import { DOCX_MIME, pagesToDocx } from './docxBuild';
import { humanError } from './util';

function docxNameFromPdf(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'document';
  const stem = base.replace(/\.pdf$/i, '').trim() || 'document';
  return `${stem}.docx`;
}

export async function pdfToDocx(
  file: PickedFile,
  onProgress?: (update: PdfToDocxProgress) => void,
): Promise<JobResult> {
  try {
    const { extractPdfText } = await import('./render');
    const pages = await extractPdfText(file, onProgress);
    const bytes = await pagesToDocx(pages);
    onProgress?.({ progress: 1, label: 'Word document ready' });
    return {
      ok: true,
      bytes,
      filename: docxNameFromPdf(file.name),
      pageCount: Math.max(1, pages.length),
      mime: DOCX_MIME,
    };
  } catch (err) {
    return { ok: false, message: humanError(err) };
  }
}
