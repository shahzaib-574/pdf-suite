/**
 * Node-friendly DOCX fixtures for exercising docxToPdf (no DOM).
 */
import JSZip from 'jszip';
import { docxBlockKinds, docxToPdf } from './docxToPdf';
import type { PickedFile } from '../lib/types';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

/** 1×1 transparent PNG */
export const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function pickedDocx(bytes: Uint8Array, name = 'sample.docx'): PickedFile {
  return { name, mime: DOCX_MIME, bytes };
}

export function documentXml(bodyInner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${NS}><w:body>${bodyInner}</w:body></w:document>`
  );
}

export function paragraphXml(
  text: string,
  opts?: { style?: string; bold?: boolean; italic?: boolean; align?: string; list?: boolean },
): string {
  const pPrParts: string[] = [];
  if (opts?.style) pPrParts.push(`<w:pStyle w:val="${xmlEscape(opts.style)}"/>`);
  if (opts?.align) pPrParts.push(`<w:jc w:val="${xmlEscape(opts.align)}"/>`);
  if (opts?.list) {
    pPrParts.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  }
  const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join('')}</w:pPr>` : '';
  const rPrParts: string[] = [];
  if (opts?.bold) rPrParts.push('<w:b/>');
  if (opts?.italic) rPrParts.push('<w:i/>');
  const rPr = rPrParts.length ? `<w:rPr>${rPrParts.join('')}</w:rPr>` : '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

export async function buildDocx(parts: {
  documentXml: string;
  relsXml?: string;
  numberingXml?: string;
  files?: Record<string, Uint8Array | string>;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', parts.documentXml);
  if (parts.relsXml) zip.file('word/_rels/document.xml.rels', parts.relsXml);
  if (parts.numberingXml) zip.file('word/numbering.xml', parts.numberingXml);
  if (parts.files) {
    for (const [path, data] of Object.entries(parts.files)) {
      zip.file(path, data);
    }
  }
  return zip.generateAsync({ type: 'uint8array' });
}

export async function buildMinimalDocx(paragraphs: string[]): Promise<Uint8Array> {
  return buildDocx({
    documentXml: documentXml(paragraphs.map((p) => paragraphXml(p)).join('')),
  });
}

export async function runDocxToPdfSelfCheck(): Promise<void> {
  const bad = await docxToPdf(pickedDocx(new Uint8Array([1, 2, 3, 4]), 'nope.txt'));
  if (bad.ok || !/docx/i.test(bad.message)) {
    throw new Error(`expected non-docx error, got ${JSON.stringify(bad)}`);
  }

  const emptyZip = await new JSZip().generateAsync({ type: 'uint8array' });
  const missing = await docxToPdf(pickedDocx(emptyZip));
  if (missing.ok || !/docx/i.test(missing.message)) {
    throw new Error(`expected missing document.xml error, got ${JSON.stringify(missing)}`);
  }

  const emptyDoc = await docxToPdf(
    pickedDocx(await buildDocx({ documentXml: documentXml('<w:p/>') })),
  );
  if (!emptyDoc.ok || emptyDoc.filename !== 'sample.pdf' || !emptyDoc.pageCount) {
    throw new Error(`empty doc should still yield a PDF, got ${JSON.stringify({
      ok: emptyDoc.ok,
      filename: emptyDoc.ok ? emptyDoc.filename : undefined,
      pageCount: emptyDoc.ok ? emptyDoc.pageCount : undefined,
    })}`);
  }

  const richXml = documentXml(
    paragraphXml('Title line', { style: 'Heading1' }) +
      paragraphXml('Hello world', { bold: true }) +
      paragraphXml('A listed item', { list: true }) +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      paragraphXml('After the break') +
      '<w:tbl><w:tr><w:tc>' +
      paragraphXml('cell a') +
      '</w:tc><w:tc>' +
      paragraphXml('cell b') +
      '</w:tc></w:tr></w:tbl>',
  );
  const rich = await docxToPdf(pickedDocx(await buildDocx({ documentXml: richXml })));
  if (!rich.ok || (rich.pageCount ?? 0) < 2) {
    throw new Error(`rich doc failed: ${JSON.stringify(rich)}`);
  }

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/dot.png"/>` +
    `</Relationships>`;
  const withImg = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="127000" cy="127000"/>' +
            '<a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
            '<pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
            '</wp:inline></w:drawing></w:r></w:p>',
        ),
        relsXml: rels,
        files: { 'word/media/dot.png': PNG_1X1 },
      }),
    ),
  );
  if (!withImg.ok || !withImg.pageCount) {
    throw new Error(`image doc failed: ${JSON.stringify({ ok: withImg.ok })}`);
  }

  const wrapped = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p><w:r><w:t>Before</w:t><w:lastRenderedPageBreak/><w:t>After</w:t></w:r></w:p>',
        ),
      }),
    ),
  );
  if (!wrapped.ok || (wrapped.pageCount ?? 0) !== 1) {
    throw new Error(
      `lastRenderedPageBreak must not force a page, got ${wrapped.ok ? wrapped.pageCount : 'err'}`,
    );
  }

  const unlist = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p><w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr>' +
            '<w:r><w:t>Not a list</w:t></w:r></w:p>',
        ),
      }),
    ),
  );
  if (!unlist.ok) {
    throw new Error('numId 0 document failed');
  }

  const encodedRels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/dot%20x.png"/>` +
    `</Relationships>`;
  const encodedImg = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="127000" cy="127000"/>' +
            '<a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
            '<pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>' +
            '</wp:inline></w:drawing></w:r></w:p>',
        ),
        relsXml: encodedRels,
        files: { 'word/media/dot x.png': PNG_1X1 },
      }),
    ),
  );
  if (!encodedImg.ok || !encodedImg.pageCount) {
    throw new Error('percent-encoded image target failed');
  }

  const named = await docxToPdf(
    pickedDocx(await buildMinimalDocx(['Named']), 'Invoice-2024.docx'),
  );
  if (!named.ok || named.filename !== 'Invoice-2024.pdf') {
    throw new Error(`expected Invoice-2024.pdf, got ${named.ok ? named.filename : 'err'}`);
  }

  const tableXml = documentXml(
    paragraphXml('Before table') +
      '<w:tbl>' +
      '<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/><w:gridCol w:w="2400"/></w:tblGrid>' +
      '<w:tr>' +
      '<w:tc><w:tcPr><w:shd w:fill="D9E2F3"/></w:tcPr>' +
      paragraphXml('Name', { bold: true }) +
      '</w:tc>' +
      '<w:tc>' +
      paragraphXml('Qty', { bold: true }) +
      '</w:tc>' +
      '<w:tc>' +
      paragraphXml('Total', { bold: true }) +
      '</w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:tc>' +
      paragraphXml('Apples') +
      '</w:tc>' +
      '<w:tc>' +
      paragraphXml('3') +
      '</w:tc>' +
      '<w:tc>' +
      paragraphXml('12') +
      '</w:tc>' +
      '</w:tr>' +
      '</w:tbl>' +
      paragraphXml('After table'),
  );
  const tableFile = pickedDocx(await buildDocx({ documentXml: tableXml }), 'grid.docx');
  const kinds = await docxBlockKinds(tableFile);
  if (!kinds.includes('table')) {
    throw new Error(`expected a table block, got ${kinds.join(',')}`);
  }
  const tableDoc = await docxToPdf(tableFile);
  if (!tableDoc.ok || tableDoc.filename !== 'grid.pdf') {
    throw new Error('table document failed to convert');
  }

  const wrappedTbl = documentXml(
    '<w:sdt><w:sdtContent>' +
      '<w:tbl><w:tr><w:tc>' +
      paragraphXml('inside sdt') +
      '</w:tc></w:tr></w:tbl>' +
      '</w:sdtContent></w:sdt>',
  );
  const wrappedKinds = await docxBlockKinds(
    pickedDocx(await buildDocx({ documentXml: wrappedTbl })),
  );
  if (!wrappedKinds.includes('table')) {
    throw new Error(`table inside sdt not found: ${wrappedKinds.join(',')}`);
  }

  const noBorderXml = documentXml(
    '<w:tbl><w:tblPr><w:tblBorders>' +
      '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>' +
      '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>' +
      '</w:tblBorders></w:tblPr>' +
      '<w:tr><w:tc>' +
      paragraphXml('quiet') +
      '</w:tc></w:tr></w:tbl>',
  );
  const noBorder = await docxToPdf(
    pickedDocx(await buildDocx({ documentXml: noBorderXml })),
  );
  if (!noBorder.ok) {
    throw new Error('borderless table failed to convert');
  }

  const spaced = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p><w:pPr><w:spacing w:before="240" w:after="480" w:line="480" w:lineRule="auto"/>' +
            '<w:ind w:left="720"/></w:pPr><w:r><w:t>Spaced</w:t></w:r></w:p>',
        ),
      }),
    ),
  );
  if (!spaced.ok) {
    throw new Error('spaced paragraph failed to convert');
  }

  const topHeavy = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(
          '<w:p/>' +
            '<w:p/>' +
            paragraphXml('After blanks', { style: 'Heading1' }) +
            '<w:sectPr><w:pgMar w:top="2160" w:right="1440" w:bottom="1440" w:left="1440"/>' +
            '<w:pgSz w:w="11906" w:h="16838"/></w:sectPr>',
        ),
      }),
    ),
  );
  if (!topHeavy.ok || !topHeavy.pageCount) {
    throw new Error('top blank lines / large top margin failed');
  }

  const manyShort = Array.from({ length: 48 }, (_, i) => {
    return (
      `<w:p><w:pPr><w:spacing w:after="480"/></w:pPr>` +
      `<w:r><w:t>Line ${i + 1}</w:t></w:r></w:p>`
    );
  }).join('');
  const onePageSpaced = await docxToPdf(
    pickedDocx(await buildDocx({ documentXml: documentXml(manyShort) })),
  );
  if (!onePageSpaced.ok || (onePageSpaced.pageCount ?? 0) !== 1) {
    throw new Error(
      `short lines with after-spacing must stay 1 page, got ${
        onePageSpaced.ok ? onePageSpaced.pageCount : 'err'
      }`,
    );
  }

  const trailingBlanks = await docxToPdf(
    pickedDocx(
      await buildDocx({
        documentXml: documentXml(paragraphXml('Only line') + '<w:p/>'.repeat(80)),
      }),
    ),
  );
  if (!trailingBlanks.ok || (trailingBlanks.pageCount ?? 0) !== 1) {
    throw new Error(
      `empty trailing paragraphs must not add a blank page, got ${
        trailingBlanks.ok ? trailingBlanks.pageCount : 'err'
      }`,
    );
  }

  if (named.extra?.wordToPdf?.warnings?.length) {
    throw new Error('Latin-only doc must not set wordToPdf warnings');
  }

  const cjk = await docxToPdf(
    pickedDocx(await buildDocx({ documentXml: documentXml(paragraphXml('你好世界')) })),
  );
  if (!cjk.ok || !cjk.pageCount) {
    throw new Error(`CJK doc should still produce a PDF, got ${JSON.stringify(cjk)}`);
  }
  const report = cjk.extra?.wordToPdf;
  if (!report || report.replacedChars <= 0 || report.warnings.length === 0) {
    throw new Error(`expected replacement warning, got ${JSON.stringify(cjk.ok ? cjk.extra : cjk)}`);
  }
}
