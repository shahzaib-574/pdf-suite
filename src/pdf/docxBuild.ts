import JSZip from 'jszip';
import type {
  PdfBlock,
  PdfParagraphLine,
  PdfTextPage,
  PdfTextRun,
} from './textTypes';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function halfPoints(size: number): number {
  return Math.max(16, Math.min(72, Math.round(size * 2)));
}

function indentTwips(x: number, pageWidth: number): number {
  if (pageWidth <= 0) return 0;
  const pt = Math.max(0, Math.min(pageWidth - 12, x));
  if (pt < 3) return 0;
  return Math.round(pt * 20);
}

function fontFamily(value: string | undefined): string {
  const cleaned = value?.replace(/^[A-Z]{6}\+/, '').replace(/["']/g, '').trim();
  if (!cleaned) return 'Arial';
  if (/helvetica|sans-serif/i.test(cleaned)) return 'Arial';
  if (/times|serif/i.test(cleaned)) return 'Times New Roman';
  if (/courier|monospace/i.test(cleaned)) return 'Courier New';
  return cleaned.slice(0, 80);
}

function runXml(text: string, fontSize: number, style?: Partial<PdfTextRun>): string {
  const sz = halfPoints(style?.fontSize ?? fontSize);
  const family = xmlEscape(fontFamily(style?.fontFamily));
  const bold = style?.bold ? '<w:b/><w:bCs/>' : '';
  const italic = style?.italic ? '<w:i/><w:iCs/>' : '';
  return (
    `<w:r><w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>` +
    `${bold}${italic}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
  );
}

function lineRunsXml(line: PdfParagraphLine): string {
  const runs = line.runs?.filter((run) => run.text.length > 0);
  if (!runs || runs.length === 0) return runXml(line.text, line.fontSize);
  return runs.map((run) => runXml(run.text, line.fontSize, run)).join('');
}

function paraXml(
  lines: PdfParagraphLine[],
  heading: boolean,
  leftTwips: number,
  options?: {
    alignment?: 'left' | 'center' | 'right';
    direction?: 'ltr' | 'rtl';
    lineSpacingPt?: number;
    spaceBeforePt?: number;
    spaceAfterPt?: number;
  },
): string {
  const before = Math.max(0, Math.round((options?.spaceBeforePt ?? 0) * 20));
  const after = Math.max(0, Math.round((options?.spaceAfterPt ?? 0) * 20));
  const line = Math.max(180, Math.round((options?.lineSpacingPt ?? 12) * 20));
  const pPrParts = [
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="exact"/>`,
  ];
  if (heading) pPrParts.unshift('<w:pStyle w:val="Heading1"/>');
  if (leftTwips > 0) pPrParts.push(`<w:ind w:left="${leftTwips}"/>`);
  if (options?.alignment && options.alignment !== 'left') {
    pPrParts.push(`<w:jc w:val="${options.alignment}"/>`);
  }
  if (options?.direction === 'rtl') pPrParts.push('<w:bidi/>');
  const pPr = `<w:pPr>${pPrParts.join('')}</w:pPr>`;
  const runs = lines
    .map((line, i) => {
      const br = i > 0 ? '<w:r><w:br/></w:r>' : '';
      return `${br}${lineRunsXml(line)}`;
    })
    .join('');
  return `<w:p>${pPr}${runs || runXml('', 11)}</w:p>`;
}

function normalizedColumnWidths(
  block: Extract<PdfBlock, { kind: 'table' }>,
  pageWidth: number,
  cols: number,
): number[] {
  const available = Math.max(72, pageWidth - Math.max(0, block.x ?? 0) - 12);
  const supplied = block.columnWidthsPt?.slice(0, cols);
  let widths: number[];
  if (supplied && supplied.length === cols && supplied.every((width) => width > 0)) {
    widths = supplied;
  } else {
    const weights = Array.from({ length: cols }, (_, index) => {
      const longest = Math.max(
        1,
        ...block.rows.map((row) => (row[index] ?? '').split('\n').reduce((m, line) => Math.max(m, line.length), 0)),
      );
      return Math.max(3, Math.sqrt(longest));
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    widths = weights.map((weight) => (available * weight) / totalWeight);
  }
  const sum = widths.reduce((total, width) => total + width, 0) || 1;
  const scale = sum > available ? available / sum : 1;
  return widths.map((width) => Math.max(18, width * scale));
}

function cellParagraphXml(text: string, bold = false): string {
  const lines = (text || '').split('\n').map((value) => ({
    text: value,
    fontSize: 10.5,
    runs: [{ text: value, fontSize: 10.5, bold }],
  }));
  return paraXml(lines, false, 0, {
    lineSpacingPt: 13,
    spaceBeforePt: 0,
    spaceAfterPt: 0,
  });
}

function tableXml(block: Extract<PdfBlock, { kind: 'table' }>, pageWidth: number): string {
  const { rows } = block;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const widths = normalizedColumnWidths(block, pageWidth, cols);
  const twips = widths.map((width) => Math.max(240, Math.round(width * 20)));
  const tableW = twips.reduce((sum, width) => sum + width, 0);
  const tableIndent = indentTwips(block.x ?? 0, pageWidth);
  const grid = twips.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>`;
  const trs = rows
    .map((row, rowIndex) => {
      const cells = [];
      for (let i = 0; i < cols; i++) {
        const text = row[i] ?? '';
        cells.push(
          '<w:tc><w:tcPr><w:tcW w:w="' +
            (twips[i] ?? 240) +
            '" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>' +
            cellParagraphXml(text, rowIndex < (block.headerRows ?? 0)) +
            '</w:tc>',
        );
      }
      return `<w:tr>${cells.join('')}</w:tr>`;
    })
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${tableW}" w:type="dxa"/>` +
    `<w:tblInd w:w="${tableIndent}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
    '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblBorders>' +
    border('top') +
    border('left') +
    border('bottom') +
    border('right') +
    border('insideH') +
    border('insideV') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>`
  );
}

function imageXml(relId: string, name: string, cx: number, cy: number, docPrId: number): string {
  return (
    '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="${xmlEscape(name)}"/>` +
    `<a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${PIC_NS}">` +
    `<pic:pic xmlns:pic="${PIC_NS}"><pic:nvPicPr>` +
    `<pic:cNvPr id="0" name="${xmlEscape(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  );
}

function spacerXml(points: number | undefined): string {
  const before = Math.max(0, Math.round((points ?? 0) * 20));
  if (before < 20) return '';
  return (
    `<w:p><w:pPr><w:spacing w:before="${before}" w:after="0" w:line="20" w:lineRule="exact"/>` +
    '</w:pPr><w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:t></w:t></w:r></w:p>'
  );
}

function columnTableXml(
  block: Extract<PdfBlock, { kind: 'columns' }>,
  pageWidth: number,
  media: Media[],
  xOrigin = 0,
): string {
  const { columns } = block;
  const cols = Math.max(1, columns.length);
  const available = Math.max(72, pageWidth - Math.max(0, (block.x ?? xOrigin) - xOrigin));
  const supplied = block.widthsPt?.slice(0, cols);
  const raw =
    supplied && supplied.length === cols
      ? supplied
      : Array.from({ length: cols }, () => available / cols);
  const rawSum = raw.reduce((sum, width) => sum + width, 0) || 1;
  const scale = rawSum > available ? available / rawSum : 1;
  const widths = raw.map((width) => Math.max(36, width * scale));
  const twips = widths.map((width) => Math.round(width * 20));
  const tableW = twips.reduce((sum, width) => sum + width, 0);
  const tableIndent = indentTwips(Math.max(0, (block.x ?? xOrigin) - xOrigin), pageWidth);
  const grid = twips.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  let columnStart = block.x ?? xOrigin;
  const cells = columns
    .map((blocks, index) => {
      const columnWidth = widths[index] ?? available / cols;
      const origin = columnStart;
      columnStart += columnWidth;
      const inner =
        blocks
          .map((child, childIndex) =>
            blockXml(child, columnWidth, media, {
              xOrigin: origin,
              suppressSpaceBefore: childIndex === 0,
            }),
          )
          .join('') || paraXml([{ text: '', fontSize: 11 }], false, 0);
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${twips[index] ?? 720}" w:type="dxa"/>` +
        '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>' +
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>' +
        `</w:tcPr>${inner}</w:tc>`
      );
    })
    .join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${tableW}" w:type="dxa"/>` +
    `<w:tblInd w:w="${tableIndent}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblBorders>' +
    '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>' +
    '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>' +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`
  );
}

type Media = { relId: string; name: string; bytes: Uint8Array };

function blockXml(
  block: PdfBlock,
  pageWidth: number,
  media: Media[],
  options?: { xOrigin?: number; suppressSpaceBefore?: boolean },
): string {
  const xOrigin = options?.xOrigin ?? 0;
  const spaceBeforePt = options?.suppressSpaceBefore ? 0 : block.kind === 'image' ? 0 : block.spaceBeforePt;
  if (block.kind === 'para') {
    return paraXml(
      block.lines,
      block.heading,
      indentTwips(Math.max(0, block.x - xOrigin), pageWidth),
      {
        alignment: block.alignment,
        direction: block.direction,
        lineSpacingPt: block.lineSpacingPt,
        spaceBeforePt,
      },
    );
  }
  if (block.kind === 'table') {
    const local = { ...block, x: Math.max(0, (block.x ?? xOrigin) - xOrigin) };
    return `${spacerXml(spaceBeforePt)}${tableXml(local, pageWidth)}`;
  }
  if (block.kind === 'columns') {
    return `${spacerXml(spaceBeforePt)}${columnTableXml(block, pageWidth, media, xOrigin)}`;
  }
  const relId = `rId${media.length + 2}`;
  const name = `image${media.length + 1}.jpeg`;
  media.push({ relId, name, bytes: block.bytes });
  // Image-only PDF pages are the safe fallback for scans. With zero section
  // margins the image can use the source page width instead of the old
  // letter-page content width, which unnecessarily shrank A4 and landscape pages.
  const maxW = Math.max(72, pageWidth);
  const scale = Math.min(1, maxW / Math.max(block.widthPt, 1));
  const cx = Math.round(block.widthPt * scale * 12700);
  const cy = Math.round(block.heightPt * scale * 12700);
  return imageXml(relId, name, cx, cy, media.length);
}

function pageSectionXml(page: PdfTextPage, final: boolean): string {
  const width = Math.max(1440, Math.round((page.width || 612) * 20));
  const height = Math.max(1440, Math.round((page.height || 792) * 20));
  const first = page.blocks.find((block) => block.kind !== 'image');
  const topMargin =
    first
      ? Math.max(0, Math.round(Math.max(0, (page.height || 792) - (first.top ?? page.height)) * 20))
      : 0;
  return (
    `<w:sectPr>${final ? '' : '<w:type w:val="nextPage"/>'}` +
    `<w:pgSz w:w="${width}" w:h="${height}"/>` +
    `<w:pgMar w:top="${topMargin}" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>` +
    '</w:sectPr>'
  );
}

export async function pagesToDocx(pages: PdfTextPage[]): Promise<Uint8Array> {
  const media: Media[] = [];
  const bodyParts: string[] = [];
  const list =
    pages.length > 0 ? pages : [{ width: 612, height: 792, blocks: [] as PdfBlock[] }];
  list.forEach((page, index) => {
    if (page.blocks.length === 0) {
      bodyParts.push(
        paraXml([{ text: '(No extractable text on this page.)', fontSize: 11 }], false, 0, {
          spaceBeforePt: 36,
        }),
      );
    } else {
      for (let blockIndex = 0; blockIndex < page.blocks.length; blockIndex++) {
        const block = page.blocks[blockIndex]!;
        bodyParts.push(
          blockXml(block, page.width || 612, media, {
            suppressSpaceBefore: blockIndex === 0,
          }),
        );
      }
    }
    if (index < list.length - 1) {
      bodyParts.push(
        '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>' +
          pageSectionXml(page, false) +
          '</w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t></w:t></w:r></w:p>',
      );
    }
  });
  const finalPage = list[list.length - 1]!;

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
    `<w:body>${bodyParts.join('')}` +
    `${pageSectionXml(finalPage, true)}</w:body></w:document>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${W_NS}">` +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    '<w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
    '<w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/>' +
    '<w:spacing w:before="240" w:after="120"/></w:pPr>' +
    '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
    '</w:styles>';

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  const docRels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  ];
  media.forEach((item) => {
    docRels.push(
      `<Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`,
    );
    zip.file(`word/media/${item.name}`, item.bytes);
  });
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      docRels.join('') +
      '</Relationships>',
  );
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  return zip.generateAsync({ type: 'uint8array' });
}
