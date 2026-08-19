import JSZip from 'jszip';
import type { PdfBlock, PdfTextPage } from './textTypes';

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
  const usable = 9360;
  const pt = (Math.max(0, x) / pageWidth) * usable;
  if (pt < 120) return 0;
  return Math.round(Math.min(4320, pt));
}

function runXml(text: string, fontSize: number): string {
  const sz = halfPoints(fontSize);
  return (
    `<w:r><w:rPr><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
  );
}

function paraXml(
  lines: { text: string; fontSize: number }[],
  heading: boolean,
  leftTwips: number,
): string {
  const pPrParts = ['<w:spacing w:after="60" w:line="240" w:lineRule="auto"/>'];
  if (heading) pPrParts.unshift('<w:pStyle w:val="Heading1"/>');
  if (leftTwips > 0) pPrParts.push(`<w:ind w:left="${leftTwips}"/>`);
  const pPr = `<w:pPr>${pPrParts.join('')}</w:pPr>`;
  const runs = lines
    .map((line, i) => {
      const br = i > 0 ? '<w:r><w:br/></w:r>' : '';
      return `${br}${runXml(line.text, line.fontSize)}`;
    })
    .join('');
  return `<w:p>${pPr}${runs || runXml('', 11)}</w:p>`;
}

function tableXml(rows: string[][]): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const colW = Math.max(200, Math.floor(9000 / cols));
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('');
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="666666"/>`;
  const trs = rows
    .map((row) => {
      const cells = [];
      for (let i = 0; i < cols; i++) {
        const text = row[i] ?? '';
        cells.push(
          '<w:tc><w:tcPr><w:tcW w:w="' +
            colW +
            '" w:type="dxa"/></w:tcPr>' +
            paraXml([{ text, fontSize: 11 }], false, 0) +
            '</w:tc>',
        );
      }
      return `<w:tr>${cells.join('')}</w:tr>`;
    })
    .join('');
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders>' +
    border('top') +
    border('left') +
    border('bottom') +
    border('right') +
    border('insideH') +
    border('insideV') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>` +
    '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>'
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

function columnTableXml(
  columns: PdfBlock[][],
  pageWidth: number,
  media: Media[],
): string {
  const cols = Math.max(1, columns.length);
  const colW = Math.max(200, Math.floor(9000 / cols));
  const grid = Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('');
  const cells = columns
    .map((blocks) => {
      const inner = blocks.map((b) => blockXml(b, pageWidth, media)).join('') || paraXml([{ text: '', fontSize: 11 }], false, 0);
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`
      );
    })
    .join('');
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders>' +
    '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>' +
    '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>' +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${grid}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>` +
    '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>'
  );
}

type Media = { relId: string; name: string; bytes: Uint8Array };

function blockXml(block: PdfBlock, pageWidth: number, media: Media[]): string {
  if (block.kind === 'para') {
    return paraXml(block.lines, block.heading, indentTwips(block.x, pageWidth));
  }
  if (block.kind === 'table') return tableXml(block.rows);
  if (block.kind === 'columns') return columnTableXml(block.columns, pageWidth, media);
  const relId = `rId${media.length + 2}`;
  const name = `image${media.length + 1}.jpeg`;
  media.push({ relId, name, bytes: block.bytes });
  const maxW = 468;
  const scale = Math.min(1, maxW / Math.max(block.widthPt, 1));
  const cx = Math.round(block.widthPt * scale * 12700);
  const cy = Math.round(block.heightPt * scale * 12700);
  return imageXml(relId, name, cx, cy, media.length);
}

function pageBreakXml(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

export async function pagesToDocx(pages: PdfTextPage[]): Promise<Uint8Array> {
  const media: Media[] = [];
  const bodyParts: string[] = [];
  const list =
    pages.length > 0 ? pages : [{ width: 612, height: 792, blocks: [] as PdfBlock[] }];
  list.forEach((page, index) => {
    if (index > 0) bodyParts.push(pageBreakXml());
    if (page.blocks.length === 0) {
      bodyParts.push(
        paraXml([{ text: '(No extractable text on this page.)', fontSize: 11 }], false, 0),
      );
      return;
    }
    for (const block of page.blocks) {
      bodyParts.push(blockXml(block, page.width || 612, media));
    }
  });

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">` +
    `<w:body>${bodyParts.join('')}` +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>' +
    '</w:sectPr></w:body></w:document>';

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="${W_NS}">` +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    '<w:rPr><w:sz w:val="22"/></w:rPr></w:style>' +
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
