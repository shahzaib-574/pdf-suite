import JSZip from 'jszip';
import { pagesToDocx } from './docxBuild';
import { analyzeGlyphs, clusterLines, rulingsFromOperatorList } from './textLayout';

export async function runPagesToDocxSelfCheck(): Promise<void> {
  const glued = clusterLines([
    { str: 'Hel', x: 10, y: 100, width: 18, size: 12, eol: false },
    { str: 'lo', x: 28, y: 100.4, width: 12, size: 12, eol: false },
    { str: 'World', x: 48, y: 100.2, width: 36, size: 12, eol: false },
  ]);
  if (glued.length !== 1 || glued[0]?.text !== 'Hello World') {
    throw new Error(`expected "Hello World", got ${JSON.stringify(glued)}`);
  }

  const tableBlocks = analyzeGlyphs(
    [
      { str: 'Name', x: 20, y: 400, width: 30, size: 11, eol: false },
      { str: 'Qty', x: 160, y: 400, width: 24, size: 11, eol: false },
      { str: 'Total', x: 300, y: 400, width: 30, size: 11, eol: false },
      { str: 'Apples', x: 20, y: 380, width: 40, size: 11, eol: false },
      { str: '3', x: 160, y: 380, width: 10, size: 11, eol: false },
      { str: '12', x: 300, y: 380, width: 16, size: 11, eol: false },
    ],
    500,
  );
  if (!tableBlocks.some((b) => b.kind === 'table')) {
    throw new Error(`expected a table block, got ${JSON.stringify(tableBlocks)}`);
  }
  const inferredTable = tableBlocks.find((block) => block.kind === 'table');
  if (inferredTable?.kind !== 'table' || inferredTable.bordered !== false) {
    throw new Error('aligned text without drawn rules should remain a borderless table');
  }

  const pathOp = 99;
  const pathBounds = [
    [15, 370, 15, 410],
    [150, 370, 150, 410],
    [290, 370, 290, 410],
    [350, 370, 350, 410],
    [15, 410, 350, 410],
    [15, 390, 350, 390],
    [15, 370, 350, 370],
  ];
  const rulings = rulingsFromOperatorList(
    {
      fnArray: pathBounds.map(() => pathOp),
      argsArray: pathBounds.map((bounds) => [[], [], bounds]),
    },
    pathOp,
  );
  const ruledTable = analyzeGlyphs(
    [
      { str: 'Name', x: 20, y: 400, width: 30, size: 11, eol: false },
      { str: 'Qty', x: 160, y: 400, width: 24, size: 11, eol: false },
      { str: 'Total', x: 300, y: 400, width: 30, size: 11, eol: false },
      { str: 'Apples', x: 20, y: 380, width: 40, size: 11, eol: false },
      { str: '3', x: 160, y: 380, width: 10, size: 11, eol: false },
      { str: '12', x: 300, y: 380, width: 16, size: 11, eol: false },
    ],
    500,
    600,
    rulings,
  ).find((block) => block.kind === 'table');
  if (ruledTable?.kind !== 'table' || !ruledTable.bordered) {
    throw new Error(`drawn PDF rules should produce a bordered table: ${JSON.stringify(ruledTable)}`);
  }

  const tightTable = analyzeGlyphs(
    [
      { str: 'Name', x: 20, y: 400, width: 36, size: 11, eol: false },
      { str: 'Qty', x: 68, y: 400, width: 22, size: 11, eol: false },
      { str: 'Total', x: 108, y: 400, width: 30, size: 11, eol: false },
      { str: 'Apples', x: 20, y: 384, width: 40, size: 11, eol: false },
      { str: '3', x: 68, y: 384, width: 8, size: 11, eol: false },
      { str: '12', x: 108, y: 384, width: 16, size: 11, eol: false },
    ],
    400,
  );
  if (!tightTable.some((b) => b.kind === 'table')) {
    throw new Error(`expected a tight table, got ${JSON.stringify(tightTable)}`);
  }

  const colBlocks = analyzeGlyphs(
    [
      { str: 'The left column starts here with a longer sentence.', x: 20, y: 500, width: 180, size: 11, eol: false },
      { str: 'It continues with more left-column prose under that.', x: 20, y: 480, width: 190, size: 11, eol: false },
      { str: 'A third left line keeps the article going.', x: 20, y: 460, width: 170, size: 11, eol: false },
      { str: 'The right column is a separate article stream.', x: 300, y: 495, width: 175, size: 11, eol: false },
      { str: 'More right-column text sits in this band.', x: 300, y: 475, width: 160, size: 11, eol: false },
      { str: 'And a third right line finishes the column.', x: 300, y: 455, width: 168, size: 11, eol: false },
    ],
    520,
  );
  if (!colBlocks.some((b) => b.kind === 'columns')) {
    throw new Error(`expected columns, got ${JSON.stringify(colBlocks)}`);
  }

  const whitespaceTable = analyzeGlyphs(
    [400, 380, 360].flatMap((y, row) => [
      { str: row === 0 ? 'Item' : `Row ${row}`, x: 24, y, width: 38, size: 10, eol: false },
      { str: ' ', x: 62, y, width: 98, size: 10, eol: false },
      { str: row === 0 ? 'Qty' : String(row), x: 160, y, width: 20, size: 10, eol: false },
      { str: ' ', x: 180, y, width: 100, size: 10, eol: false },
      { str: row === 0 ? 'Total' : `$${row * 10}`, x: 280, y, width: 32, size: 10, eol: false },
    ]),
    400,
    500,
  );
  if (!whitespaceTable.some((block) => block.kind === 'table')) {
    throw new Error(`wide PDF whitespace must preserve table cells: ${JSON.stringify(whitespaceTable)}`);
  }

  const spacedParagraphs = analyzeGlyphs(
    [
      { str: 'First paragraph', x: 72, y: 500, width: 90, size: 11, eol: false },
      { str: 'wrapped line', x: 72, y: 485, width: 70, size: 11, eol: false },
      { str: 'Second paragraph', x: 72, y: 445, width: 100, size: 11, eol: false },
    ],
    612,
    792,
  );
  if (spacedParagraphs.filter((block) => block.kind === 'para').length !== 2) {
    throw new Error(`paragraph gaps were collapsed: ${JSON.stringify(spacedParagraphs)}`);
  }

  const indentedParagraph = analyzeGlyphs(
    [
      { str: 'Indented opening line with enough text to wrap', x: 90, y: 500, width: 245, size: 11, eol: false },
      { str: 'continuation aligned to the paragraph body', x: 72, y: 485, width: 220, size: 11, eol: false },
    ],
    612,
    792,
  ).filter((block) => block.kind === 'para');
  if (
    indentedParagraph.length !== 1 ||
    indentedParagraph[0]?.kind !== 'para' ||
    indentedParagraph[0].firstLineIndentPt !== 18
  ) {
    throw new Error(`first-line indentation was not preserved: ${JSON.stringify(indentedParagraph)}`);
  }

  const listBlocks = analyzeGlyphs(
    [
      { str: '1. First item', x: 72, y: 410, width: 78, size: 11, eol: false },
      { str: '2. Second item', x: 72, y: 394, width: 88, size: 11, eol: false },
    ],
    612,
    792,
  ).filter((block) => block.kind === 'para');
  if (
    listBlocks.length !== 2 ||
    listBlocks.some((block) => block.kind !== 'para' || block.list?.kind !== 'number') ||
    listBlocks[0]?.kind !== 'para' ||
    listBlocks[0].lines[0]?.text !== 'First item'
  ) {
    throw new Error(`numbered PDF lines should become list items: ${JSON.stringify(listBlocks)}`);
  }

  const bytes = await pagesToDocx([
    {
      width: 612,
      height: 792,
      blocks: [
        {
          kind: 'para',
          heading: true,
          x: 72,
          top: 760,
          bottom: 735,
          spaceBeforePt: 32,
          lines: [
            {
              text: 'Quarterly Report',
              fontSize: 22,
              runs: [{ text: 'Quarterly ', fontSize: 22, bold: true }, { text: 'Report', fontSize: 22, italic: true }],
            },
          ],
        },
        {
          kind: 'para',
          heading: false,
          x: 72,
          firstLineIndentPt: 18,
          lines: [{ text: 'Revenue was up.', fontSize: 11 }],
        },
        {
          kind: 'table',
          rows: [['Name', 'Qty'], ['Apples', '3']],
          x: 72,
          columnWidthsPt: [300, 120],
          columnAlignments: ['left', 'right'],
          headerRows: 1,
          bordered: true,
        },
        {
          kind: 'para',
          heading: false,
          x: 72,
          list: { kind: 'number', level: 0, sequence: 1, start: 1 },
          lines: [{ text: 'First numbered item', fontSize: 11 }],
        },
        {
          kind: 'para',
          heading: false,
          x: 72,
          list: { kind: 'number', level: 0, sequence: 1, start: 2 },
          lines: [{ text: 'Second numbered item', fontSize: 11 }],
        },
      ],
    },
    {
      width: 612,
      height: 792,
      blocks: [
        {
          kind: 'para',
          heading: false,
          x: 72,
          lines: [{ text: 'Second page notes.', fontSize: 11 }],
        },
      ],
    },
  ]);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('docx missing word/document.xml');
  if (!xml.includes('Quarterly ') || !xml.includes('Report')) {
    throw new Error('heading text missing from docx');
  }
  if (!xml.includes('Revenue was up.')) {
    throw new Error('body text missing from docx');
  }
  if (!xml.includes('Second page notes.')) {
    throw new Error('page 2 text missing from docx');
  }
  if (!xml.includes('<w:type w:val="nextPage"/>')) {
    throw new Error('expected a next-page section between PDF pages');
  }
  if (!xml.includes('Heading1')) {
    throw new Error('expected Heading1 style on larger text');
  }
  if (!xml.includes('<w:tbl>') || !xml.includes('Apples')) {
    throw new Error('expected a Word table with cell text');
  }
  if (!xml.includes('<w:tblLayout w:type="fixed"/>') || !xml.includes('<w:tblInd w:w="0"')) {
    throw new Error('expected fixed table geometry inside source-derived page margins');
  }
  if (!xml.includes('<w:pgMar w:top="640"') || !xml.includes('w:left="1440"')) {
    throw new Error('expected source page whitespace to become editable Word page margins');
  }
  if (!xml.includes('w:firstLine="360"')) {
    throw new Error('expected first-line paragraph indentation to survive');
  }
  if (!xml.includes('<w:tblHeader/>') || !xml.includes('<w:jc w:val="right"/>')) {
    throw new Error('expected repeating headers and numeric-column alignment');
  }
  if (!xml.includes('<w:b/>') || !xml.includes('<w:i/>')) {
    throw new Error('expected bold and italic PDF runs to survive in DOCX');
  }
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');
  if (!numberingXml?.includes('<w:numFmt w:val="decimal"/>') || !xml.includes('<w:numPr>')) {
    throw new Error('expected PDF list markers to become real Word numbering');
  }

  const empty = await pagesToDocx([{ width: 612, height: 792, blocks: [] }]);
  const emptyXml = await JSZip.loadAsync(empty).then((z) =>
    z.file('word/document.xml')?.async('string'),
  );
  if (!emptyXml?.includes('No extractable text')) {
    throw new Error('empty page should explain there was no text');
  }

  const scan = await pagesToDocx([
    {
      width: 612,
      height: 792,
      blocks: [
        {
          kind: 'image',
          bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
          mime: 'image/jpeg',
          widthPt: 612,
          heightPt: 792,
        },
      ],
    },
  ]);
  const scanXml = await JSZip.loadAsync(scan).then((z) =>
    z.file('word/document.xml')?.async('string'),
  );
  if (!scanXml?.includes('cx="7772400"')) {
    throw new Error('scan fallback should use the full source page width');
  }

  const landscape = await pagesToDocx([
    {
      width: 792,
      height: 612,
      blocks: [
        {
          kind: 'para',
          heading: false,
          x: 36,
          top: 576,
          bottom: 560,
          lines: [{ text: 'Landscape page', fontSize: 11 }],
        },
      ],
    },
  ]);
  const landscapeXml = await JSZip.loadAsync(landscape).then((z) =>
    z.file('word/document.xml')?.async('string'),
  );
  if (!landscapeXml?.includes('w:orient="landscape"')) {
    throw new Error('landscape PDF pages should remain landscape in Word');
  }
}
