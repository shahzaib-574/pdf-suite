import JSZip from 'jszip';
import { pagesToDocx } from './docxBuild';
import { analyzeGlyphs, clusterLines } from './textLayout';

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

  const bytes = await pagesToDocx([
    {
      width: 612,
      height: 792,
      blocks: [
        {
          kind: 'para',
          heading: true,
          x: 72,
          lines: [{ text: 'Quarterly Report', fontSize: 22 }],
        },
        {
          kind: 'para',
          heading: false,
          x: 72,
          lines: [{ text: 'Revenue was up.', fontSize: 11 }],
        },
        { kind: 'table', rows: [['Name', 'Qty'], ['Apples', '3']] },
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
  if (!xml.includes('Quarterly Report')) {
    throw new Error('heading text missing from docx');
  }
  if (!xml.includes('Revenue was up.')) {
    throw new Error('body text missing from docx');
  }
  if (!xml.includes('Second page notes.')) {
    throw new Error('page 2 text missing from docx');
  }
  if (!xml.includes('w:type="page"')) {
    throw new Error('expected a page break between PDF pages');
  }
  if (!xml.includes('Heading1')) {
    throw new Error('expected Heading1 style on larger text');
  }
  if (!xml.includes('<w:tbl>') || !xml.includes('Apples')) {
    throw new Error('expected a Word table with cell text');
  }

  const empty = await pagesToDocx([{ width: 612, height: 792, blocks: [] }]);
  const emptyXml = await JSZip.loadAsync(empty).then((z) =>
    z.file('word/document.xml')?.async('string'),
  );
  if (!emptyXml?.includes('No extractable text')) {
    throw new Error('empty page should explain there was no text');
  }
}
