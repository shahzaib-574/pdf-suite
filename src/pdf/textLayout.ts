import type {
  PdfBlock,
  PdfParagraphLine,
  PdfTextLine,
  PdfTextRun,
  TextGlyph,
} from './textTypes';

function avgY(row: TextGlyph[]): number {
  return row.reduce((sum, g) => sum + g.y, 0) / row.length;
}

function glyphWidth(g: TextGlyph): number {
  if (g.width > 0 && Number.isFinite(g.width)) return g.width;
  return Math.max(g.size * 0.4, g.str.length * g.size * 0.45);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function dominantSize(glyphs: TextGlyph[]): number {
  if (glyphs.length === 0) return 11;
  const weighted = glyphs
    .flatMap((glyph) =>
      Array.from(
        { length: Math.max(1, glyph.str.replace(/\s/g, '').length) },
        () => glyph.size,
      ),
    )
    .sort((a, b) => a - b);
  return weighted[Math.floor(weighted.length / 2)] ?? 11;
}

function sameRunStyle(a: PdfTextRun, b: PdfTextRun): boolean {
  return (
    Math.abs(a.fontSize - b.fontSize) < 0.15 &&
    a.fontFamily === b.fontFamily &&
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic)
  );
}

function cleanText(text: string): string {
  return text.replace(/[\t\r\n ]+/g, ' ').trim();
}

function rowText(glyphs: TextGlyph[]): { text: string; runs: PdfTextRun[] } {
  const ordered = [...glyphs].sort((a, b) => a.x - b.x);
  const runs: PdfTextRun[] = [];
  let text = '';
  let lastRight = Number.NEGATIVE_INFINITY;
  for (const glyph of ordered) {
    const value = cleanText(glyph.str);
    if (!value) continue;
    const gap = glyph.x - lastRight;
    const widthPerChar = glyphWidth(glyph) / Math.max(1, value.length);
    const spaceGap = Math.max(0.8, Math.min(glyph.size * 0.32, widthPerChar * 0.55));
    const previous = text[text.length - 1];
    const next = value[0];
    const punctuation = next != null && /^[,.;:!?%)\]}]/.test(next);
    const needsSpace =
      text.length > 0 && previous !== ' ' && next !== ' ' && !punctuation && gap > spaceGap;
    const run: PdfTextRun = {
      text: `${needsSpace ? ' ' : ''}${value}`,
      fontSize: glyph.size,
      fontFamily: glyph.fontFamily,
      bold: glyph.bold,
      italic: glyph.italic,
    };
    const prior = runs[runs.length - 1];
    if (prior && sameRunStyle(prior, run)) prior.text += run.text;
    else runs.push(run);
    text += run.text;
    lastRight = Math.max(lastRight, glyph.x + glyphWidth(glyph));
  }
  return { text: text.trim(), runs };
}

function tokenGroups(row: TextGlyph[]): TextGlyph[][] {
  const ordered = row.filter((glyph) => cleanText(glyph.str).length > 0).sort((a, b) => a.x - b.x);
  if (ordered.length === 0) return [];
  const groups: TextGlyph[][] = [[ordered[0]!]];
  for (let i = 1; i < ordered.length; i++) {
    const g = ordered[i]!;
    const prev = ordered[i - 1]!;
    const gap = g.x - (prev.x + glyphWidth(prev));
    const cut = Math.max(7, Math.max(prev.size, g.size) * 0.7);
    if (gap > cut) groups.push([g]);
    else groups[groups.length - 1]!.push(g);
  }
  return groups;
}

function tokensFromRow(row: TextGlyph[]): PdfTextLine['tokens'] {
  return tokenGroups(row)
    .map((group) => {
      const last = group[group.length - 1]!;
      const joined = rowText(group);
      return {
        text: joined.text,
        x: group[0]!.x,
        xEnd: last.x + glyphWidth(last),
        runs: joined.runs,
      };
    })
    .filter((t) => t.text.length > 0);
}

function joinLine(row: TextGlyph[]): PdfTextLine | undefined {
  const ordered = row.filter((glyph) => cleanText(glyph.str).length > 0).sort((a, b) => a.x - b.x);
  if (ordered.length === 0) return undefined;
  const joined = rowText(ordered);
  const text = joined.text;
  if (!text) return undefined;
  const last = ordered[ordered.length - 1]!;
  const tokens = tokensFromRow(ordered);
  const cells = tokens.map((t) => t.text);
  return {
    text,
    fontSize: dominantSize(ordered),
    x: ordered[0]!.x,
    y: avgY(ordered),
    xEnd: last.x + glyphWidth(last),
    cells: cells.length >= 2 ? cells : [text],
    tokens,
    runs: joined.runs,
    height: Math.max(...ordered.map((glyph) => glyph.size), 11),
    bold: ordered.some((glyph) => glyph.bold),
    italic: ordered.some((glyph) => glyph.italic),
    direction:
      ordered.filter((glyph) => glyph.direction === 'rtl').length > ordered.length / 2
        ? 'rtl'
        : 'ltr',
  };
}

export function clusterLines(glyphs: TextGlyph[]): PdfTextLine[] {
  const items = glyphs.filter((g) => g.str.length > 0);
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextGlyph[][] = [];
  for (const g of items) {
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push([g]);
      continue;
    }
    const baseline = avgY(current);
    const size = Math.max(current[0]?.size ?? 11, g.size);
    const thresh = Math.max(2.2, size * 0.5);
    if (Math.abs(g.y - baseline) <= thresh) current.push(g);
    else rows.push([g]);
  }
  const lines: PdfTextLine[] = [];
  for (const row of rows) {
    const line = joinLine(row);
    if (line) lines.push(line);
  }
  return lines;
}

type PdfTextStyle = {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
  bold?: boolean;
  italic?: boolean;
};

function normalizeFontFamily(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(',')[0]?.replace(/["']/g, '').trim();
  if (!first) return undefined;
  return first.replace(/^[A-Z]{6}\+/, '');
}

export function glyphFromPdfItem(
  item: unknown,
  styles?: Record<string, PdfTextStyle>,
): TextGlyph | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const rec = item as Record<string, unknown>;
  if (typeof rec.str !== 'string' || rec.str.length === 0) return undefined;
  const transform = rec.transform;
  if (!Array.isArray(transform) || transform.length < 6) return undefined;
  const x = Number(transform[4]);
  const y = Number(transform[5]);
  const a = Number(transform[0]);
  const d = Number(transform[3]);
  const itemHeight = Number(rec.height);
  const size =
    (Number.isFinite(itemHeight) && itemHeight > 0 ? itemHeight : 0) ||
    Math.hypot(Number(transform[2]) || 0, d) ||
    Math.hypot(a, Number(transform[1]) || 0) ||
    11;
  const width = Number(rec.width);
  const fontName = typeof rec.fontName === 'string' ? rec.fontName : undefined;
  const fontFamily = normalizeFontFamily(fontName ? styles?.[fontName]?.fontFamily : undefined);
  const styleName = `${fontName ?? ''} ${fontFamily ?? ''}`;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return {
    str: rec.str,
    x,
    y,
    width: Number.isFinite(width) && width > 0 ? width : 0,
    size,
    eol: rec.hasEOL === true,
    fontName,
    fontFamily,
    bold: styles?.[fontName ?? '']?.bold === true || /bold|black|heavy|semibold|demi/i.test(styleName),
    italic: styles?.[fontName ?? '']?.italic === true || /italic|oblique/i.test(styleName),
    direction: rec.dir === 'rtl' ? 'rtl' : 'ltr',
  };
}

function paragraphLine(line: PdfTextLine): PdfParagraphLine {
  return {
    text: line.text,
    fontSize: line.fontSize,
    runs: line.runs,
    x: line.x,
    xEnd: line.xEnd,
    y: line.y,
  };
}

function alignmentOf(
  line: PdfTextLine,
  pageWidth: number,
): 'left' | 'center' | 'right' {
  const width = line.xEnd - line.x;
  const centerDelta = Math.abs((line.x + line.xEnd) / 2 - pageWidth / 2);
  if (width < pageWidth * 0.82 && centerDelta <= Math.max(14, pageWidth * 0.035)) {
    return 'center';
  }
  if (line.x > pageWidth * 0.35 && line.xEnd >= pageWidth * 0.9) return 'right';
  return 'left';
}

function paraFromLines(lines: PdfTextLine[], pageWidth = 612): PdfBlock[] {
  if (lines.length === 0) return [];
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
  const typical = sizes[Math.floor((sizes.length - 1) * 0.35)] ?? 11;
  const headingSize = Math.max(typical * 1.28, typical + 2.2);
  const candidateLeadings: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = (lines[i - 1]?.y ?? 0) - (lines[i]?.y ?? 0);
    if (gap > typical * 0.75 && gap < typical * 2.1) candidateLeadings.push(gap);
  }
  const normalLeading = median(candidateLeadings) || typical * 1.2;
  const groups: Extract<PdfBlock, { kind: 'para' }>[] = [];
  for (const line of lines) {
    const heading =
      line.text.length < 120 &&
      (line.fontSize >= headingSize || (line.bold && line.fontSize >= typical * 1.16));
    const alignment = alignmentOf(line, pageWidth);
    const prev = groups[groups.length - 1];
    const prevLine = prev?.lines[prev.lines.length - 1];
    const verticalGap = prevLine?.y != null ? prevLine.y - line.y : Number.POSITIVE_INFINITY;
    const sameIndent = prev
      ? Math.abs(prev.x - line.x) < Math.max(5, line.fontSize * 0.75)
      : false;
    const sameKind = prev ? prev.heading === heading : false;
    const sameFlow =
      prev?.alignment === alignment && prev.direction === line.direction && sameIndent;
    const followsNormally =
      verticalGap > 0 && verticalGap <= Math.max(normalLeading * 1.42, line.height * 1.65);
    if (prev && sameKind && sameFlow && followsNormally && !heading) {
      prev.lines.push(paragraphLine(line));
      prev.xEnd = Math.max(prev.xEnd ?? line.xEnd, line.xEnd);
      prev.bottom = Math.min(prev.bottom ?? line.y, line.y - line.height * 0.25);
      prev.lineSpacingPt = median(
        prev.lines
          .slice(1)
          .map((item, index) => (prev.lines[index]?.y ?? 0) - (item.y ?? 0))
          .filter((gap) => gap > 0),
      ) || normalLeading;
    } else {
      groups.push({
        kind: 'para',
        lines: [paragraphLine(line)],
        heading,
        x: line.x,
        xEnd: line.xEnd,
        top: line.y + line.height * 0.82,
        bottom: line.y - line.height * 0.25,
        lineSpacingPt: normalLeading,
        alignment,
        direction: line.direction,
      });
    }
  }
  return groups;
}

function clusterLineAnchors(
  lines: PdfTextLine[],
  eps = 10,
): { x: number; count: number }[] {
  const points = lines.flatMap((line, lineIndex) =>
    (line.tokens.length > 0 ? line.tokens : [{ x: line.x }]).map((token) => ({
      x: token.x,
      lineIndex,
    })),
  );
  points.sort((a, b) => a.x - b.x);
  if (points.length === 0) return [];
  const groups: typeof points[] = [[points[0]!]];
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!;
    const group = groups[groups.length - 1]!;
    if (point.x - group[group.length - 1]!.x > eps) groups.push([point]);
    else group.push(point);
  }
  return groups
    .map((group) => ({
      x: group.reduce((sum, point) => sum + point.x, 0) / group.length,
      count: new Set(group.map((point) => point.lineIndex)).size,
    }))
    .filter((anchor) => anchor.count >= 2);
}

function tableGeometry(
  lines: PdfTextLine[],
  anchors: { x: number }[],
  pageWidth: number,
): { x: number; widths: number[] } {
  const xs = anchors.map((anchor) => anchor.x).sort((a, b) => a - b);
  const maxContent = Math.max(...lines.map((line) => line.xEnd), xs[xs.length - 1] ?? 0);
  const typicalGap = median(xs.slice(1).map((x, index) => x - (xs[index] ?? x))) || 72;
  const right = Math.min(pageWidth, Math.max(maxContent + 8, (xs[xs.length - 1] ?? 0) + typicalGap));
  const widths = xs.map((x, index) => {
    const next = xs[index + 1] ?? right;
    return Math.max(18, next - x);
  });
  return { x: xs[0] ?? 0, widths };
}

function assignCells(
  line: PdfTextLine,
  anchors: { x: number }[],
): string[] {
  const cells = anchors.map(() => '');
  const tokens = line.tokens.length > 0 ? line.tokens : [{ text: line.text, x: line.x, xEnd: line.xEnd }];
  for (const token of tokens) {
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(token.x - (anchors[i]?.x ?? 0));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const prev = cells[best] ?? '';
    cells[best] = prev ? `${prev} ${token.text}` : token.text;
  }
  return cells;
}

function inferredHeaderRows(rows: string[][], firstLineBold: boolean): number {
  if (firstLineBold) return 1;
  const first = rows[0];
  const second = rows[1];
  if (!first || !second) return 0;
  const firstTextual = first.filter(Boolean).filter((cell) => !/\d/.test(cell)).length;
  const secondNumeric = second.filter(Boolean).filter((cell) => /\d/.test(cell)).length;
  return firstTextual >= Math.max(2, first.filter(Boolean).length - 1) && secondNumeric > 0
    ? 1
    : 0;
}

function alignedTable(lines: PdfTextLine[], pageWidth = 612): PdfBlock | undefined {
  const anchors = clusterLineAnchors(lines);
  if (anchors.length < 2) return undefined;
  const rows: string[][] = [];
  let hits = 0;
  for (const line of lines) {
    const cells = assignCells(line, anchors);
    const filled = cells.filter((c) => c.length > 0).length;
    if (filled >= 2) {
      rows.push(cells);
      hits += 1;
    } else if (rows.length > 0 && filled === 1) {
      const col = cells.findIndex((c) => c.length > 0);
      if (col >= 0) {
        const last = rows[rows.length - 1]!;
        last[col] = `${last[col] ?? ''} ${cells[col]}`.trim();
      }
    } else if (rows.length > 0) {
      break;
    }
  }
  if (hits < 2 && !(hits === 1 && rows[0] && rows[0].filter(Boolean).length >= 3)) {
    return undefined;
  }
  if (rows.length === 0) return undefined;
  const geometry = tableGeometry(lines, anchors, pageWidth);
  return {
    kind: 'table',
    rows,
    x: geometry.x,
    columnWidthsPt: geometry.widths,
    top: Math.max(...lines.map((line) => line.y + line.height * 0.82)),
    bottom: Math.min(...lines.map((line) => line.y - line.height * 0.25)),
    headerRows: inferredHeaderRows(rows, lines[0]?.bold === true),
  };
}

function tableFromRun(run: PdfTextLine[], pageWidth = 612): PdfBlock | undefined {
  const aligned = alignedTable(run, pageWidth);
  if (aligned) return aligned;
  if (run.length === 0) return undefined;
  const colCount = Math.max(...run.map((l) => l.cells.length));
  if (colCount < 2) return undefined;
  const rows = run.map((line) => {
    const cells = line.cells.slice();
    while (cells.length < colCount) cells.push('');
    return cells;
  });
  return { kind: 'table', rows };
}

function consumeTable(
  lines: PdfTextLine[],
  start: number,
  anchors: { x: number; count: number }[],
  pageWidth: number,
): { table: PdfBlock; next: number } | undefined {
  const rows: string[][] = [];
  let i = start;
  let lastY = lines[start]?.y ?? 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const rowGap = lastY - line.y;
    // OCR baselines are derived from bounding boxes and can drift more than
    // embedded PDF text. Multi-cell aligned rows are still strong evidence of
    // one table, so tolerate a larger vertical gap between them.
    if (rows.length > 0 && rowGap > Math.max(48, line.height * 3.2)) break;
    const cells = assignCells(line, anchors);
    const filled = cells.filter((c) => c.length > 0).length;
    if (filled >= 2) {
      rows.push(cells);
      lastY = line.y;
      i += 1;
      continue;
    }
    if (filled === 1 && rows.length > 0 && Math.abs(line.y - lastY) < line.fontSize * 1.8) {
      const col = cells.findIndex((c) => c.length > 0);
      if (col >= 0) {
        const last = rows[rows.length - 1]!;
        last[col] = `${last[col] ?? ''}\n${cells[col]}`.trim();
      }
      lastY = line.y;
      i += 1;
      continue;
    }
    break;
  }
  if (rows.length === 0) return undefined;
  const cols = rows[0]?.filter(Boolean).length ?? 0;
  if (rows.length < 2 && cols < 3) return undefined;
  const used = lines.slice(start, i);
  const geometry = tableGeometry(used, anchors, pageWidth);
  return {
    table: {
      kind: 'table',
      rows,
      x: geometry.x,
      columnWidthsPt: geometry.widths,
      top: Math.max(...used.map((line) => line.y + line.height * 0.82)),
      bottom: Math.min(...used.map((line) => line.y - line.height * 0.25)),
      headerRows: inferredHeaderRows(rows, used[0]?.bold === true),
    },
    next: i,
  };
}

export function blocksFromLines(lines: PdfTextLine[], pageWidth = 612): PdfBlock[] {
  const ordered = [...lines].sort((a, b) => b.y - a.y || a.x - b.x);
  const anchors = clusterLineAnchors(ordered);
  if (anchors.length < 2) {
    const fallback = tableFromRun(ordered, pageWidth);
    if (fallback) return [fallback];
    return paraFromLines(ordered, pageWidth);
  }
  const out: PdfBlock[] = [];
  let i = 0;
  while (i < ordered.length) {
    const cells = assignCells(ordered[i]!, anchors);
    const filled = cells.filter((c) => c.length > 0).length;
    if (filled >= 2) {
      const taken = consumeTable(ordered, i, anchors, pageWidth);
      if (taken) {
        out.push(taken.table);
        i = taken.next;
        continue;
      }
    }
    const start = i;
    i += 1;
    while (i < ordered.length) {
      const nextFilled = assignCells(ordered[i]!, anchors).filter((c) => c.length > 0)
        .length;
      if (nextFilled >= 2) break;
      i += 1;
    }
    out.push(...paraFromLines(ordered.slice(start, i), pageWidth));
  }
  return out;
}

function splitGlyphColumns(
  glyphs: TextGlyph[],
  pageWidth: number,
): { header: TextGlyph[]; columns: TextGlyph[][]; widthsPt?: number[]; x?: number } {
  if (glyphs.length < 6 || pageWidth < 200) {
    return { header: [], columns: [glyphs] };
  }
  const visible = glyphs.filter((glyph) => cleanText(glyph.str).length > 0);
  const minX = Math.min(...visible.map((g) => g.x));
  const maxX = Math.max(...visible.map((g) => g.x + glyphWidth(g)));
  const inner = maxX - minX;
  if (inner < 140) return { header: [], columns: [glyphs] };
  const bins = 48;
  const hits = new Array<number>(bins).fill(0);
  for (const g of visible) {
    const a = Math.max(0, Math.floor(((g.x - minX) / inner) * bins));
    const b = Math.min(
      bins - 1,
      Math.floor(((g.x + glyphWidth(g) - minX) / inner) * bins),
    );
    for (let i = a; i <= b; i++) hits[i] = (hits[i] ?? 0) + 1;
  }
  let bestGap = 0;
  let bestAt = -1;
  let run = 0;
  let runStart = 0;
  const lo = Math.floor(bins * 0.18);
  const hi = Math.ceil(bins * 0.82);
  for (let i = lo; i < hi; i++) {
    if ((hits[i] ?? 0) <= 1) {
      if (run === 0) runStart = i;
      run += 1;
      if (run > bestGap) {
        bestGap = run;
        bestAt = runStart + Math.floor(run / 2);
      }
    } else run = 0;
  }
  const gapPt = (bestGap / bins) * inner;
  if (bestAt < 0 || gapPt < 24) return { header: [], columns: [glyphs] };
  const splitX = minX + ((bestAt + 0.5) / bins) * inner;
  let left = visible.filter((g) => g.x + glyphWidth(g) <= splitX + 3);
  let right = visible.filter((g) => g.x >= splitX - 3);
  const spanning = visible.filter(
    (g) => g.x < splitX && g.x + glyphWidth(g) > splitX,
  );
  if (left.length < 3 || right.length < 3) {
    return { header: [], columns: [glyphs] };
  }
  const leftLines = clusterLines(left);
  const rightLines = clusterLines(right);
  const short =
    medianLen(leftLines) < 28 &&
    medianLen(rightLines) < 28 &&
    yAligned(leftLines, rightLines);
  if (short) return { header: [], columns: [glyphs] };
  const smallerTop = Math.min(
    Math.max(...left.map((glyph) => glyph.y)),
    Math.max(...right.map((glyph) => glyph.y)),
  );
  const bodySize = median([...left, ...right].map((glyph) => glyph.size)) || 11;
  const topHeader = visible.filter(
    (glyph) =>
      glyph.y > smallerTop + Math.max(8, bodySize * 1.15) &&
      (glyph.size >= bodySize * 1.22 || glyphWidth(glyph) >= inner * 0.46),
  );
  const headerSet = new Set([...spanning, ...topHeader]);
  left = left.filter((glyph) => !headerSet.has(glyph));
  right = right.filter((glyph) => !headerSet.has(glyph));
  const header = visible.filter((glyph) => headerSet.has(glyph));
  if (left.length < 2 || right.length < 2) {
    return { header: [], columns: [glyphs] };
  }
  return {
    header,
    columns: [left, right],
    widthsPt: [Math.max(36, splitX - minX), Math.max(36, maxX - splitX)],
    x: minX,
  };
}

function medianLen(lines: PdfTextLine[]): number {
  if (lines.length === 0) return 0;
  const n = [...lines.map((l) => l.text.length)].sort((a, b) => a - b);
  return n[Math.floor(n.length / 2)] ?? 0;
}

function yAligned(a: PdfTextLine[], b: PdfTextLine[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const ys = a.map((l) => l.y);
  let hits = 0;
  for (const line of b) {
    if (ys.some((y) => Math.abs(y - line.y) < 6)) hits += 1;
  }
  return hits / b.length >= 0.6;
}

function splitColumns(
  lines: PdfTextLine[],
  pageWidth: number,
): { header: PdfTextLine[]; columns: PdfTextLine[][]; widthsPt?: number[]; x?: number } {
  if (lines.length < 4 || pageWidth < 200) {
    return { header: [], columns: [lines] };
  }
  const wide = pageWidth * 0.62;
  const header = lines.filter((l) => l.xEnd - l.x >= wide);
  const body = lines.filter((l) => l.xEnd - l.x < wide);
  if (body.length < 4) return { header: [], columns: [lines] };

  const minX = Math.min(...body.map((l) => l.x));
  const maxX = Math.max(...body.map((l) => l.xEnd));
  const inner = maxX - minX;
  if (inner < 120) return { header: [], columns: [lines] };

  const bins = 40;
  const hits = new Array<number>(bins).fill(0);
  for (const line of body) {
    const a = Math.max(0, Math.floor(((line.x - minX) / inner) * bins));
    const b = Math.min(bins - 1, Math.floor(((line.xEnd - minX) / inner) * bins));
    for (let i = a; i <= b; i++) hits[i] = (hits[i] ?? 0) + 1;
  }
  const midStart = Math.floor(bins * 0.22);
  const midEnd = Math.ceil(bins * 0.78);
  let bestGap = 0;
  let bestAt = -1;
  let run = 0;
  let runStart = midStart;
  for (let i = midStart; i < midEnd; i++) {
    if ((hits[i] ?? 0) <= 1) {
      if (run === 0) runStart = i;
      run += 1;
      if (run > bestGap) {
        bestGap = run;
        bestAt = runStart + Math.floor(run / 2);
      }
    } else {
      run = 0;
    }
  }
  const gapPt = (bestGap / bins) * inner;
  if (bestAt < 0 || gapPt < 22) return { header: [], columns: [lines] };
  const splitX = minX + ((bestAt + 0.5) / bins) * inner;
  const left = body.filter((l) => l.xEnd <= splitX + 4);
  const right = body.filter((l) => l.x >= splitX - 4);
  const span = body.filter((l) => l.x < splitX && l.xEnd > splitX);
  if (span.length > Math.max(1, body.length * 0.12)) {
    return { header: [], columns: [lines] };
  }
  if (left.length < 2 || right.length < 2) {
    return { header: [], columns: [lines] };
  }
  return {
    header,
    columns: [left, right],
    widthsPt: [Math.max(36, splitX - minX), Math.max(36, maxX - splitX)],
    x: minX,
  };
}

function blockTop(block: PdfBlock): number | undefined {
  if (block.kind === 'image') return undefined;
  return block.top;
}

function blockBottom(block: PdfBlock): number | undefined {
  if (block.kind === 'image') return undefined;
  return block.bottom;
}

function addBlockSpacing(blocks: PdfBlock[], pageHeight: number): PdfBlock[] {
  let previousBottom = pageHeight;
  for (const block of blocks) {
    if (block.kind === 'image') continue;
    const top = blockTop(block);
    const bottom = blockBottom(block);
    if (top != null) {
      // Word adds its own font leading around paragraphs and tables. Keeping the
      // raw PDF gap would double-count that leading and make every block drift
      // farther down the page, so retain the visual whitespace portion only.
      block.spaceBeforePt = Math.max(0, Math.min(pageHeight, previousBottom - top) * 0.65);
    }
    if (bottom != null) previousBottom = bottom;
  }
  return blocks;
}

export function analyzePage(
  lines: PdfTextLine[],
  pageWidth: number,
  pageHeight = 792,
): PdfBlock[] {
  if (lines.length === 0) return [];
  const { header, columns, widthsPt, x } = splitColumns(lines, pageWidth);
  const blocks: PdfBlock[] = [...paraFromLines(header, pageWidth)];
  if (columns.length <= 1) {
    blocks.push(...blocksFromLines(columns[0] ?? lines, pageWidth));
    return addBlockSpacing(blocks, pageHeight);
  }
  const columnBlocks = columns.map((col) => blocksFromLines(col, pageWidth));
  const allColumnBlocks = columnBlocks.flat();
  blocks.push({
    kind: 'columns',
    columns: columnBlocks,
    widthsPt,
    x,
    top: Math.max(...allColumnBlocks.map((block) => blockTop(block) ?? 0)),
    bottom: Math.min(...allColumnBlocks.map((block) => blockBottom(block) ?? pageHeight)),
  });
  return addBlockSpacing(blocks, pageHeight);
}

export function analyzeGlyphs(
  glyphs: TextGlyph[],
  pageWidth: number,
  pageHeight = 792,
): PdfBlock[] {
  if (glyphs.length === 0) return [];
  const { header, columns, widthsPt, x } = splitGlyphColumns(glyphs, pageWidth);
  const blocks: PdfBlock[] = [...paraFromLines(clusterLines(header), pageWidth)];
  if (columns.length <= 1) {
    blocks.push(...blocksFromLines(clusterLines(columns[0] ?? glyphs), pageWidth));
    return addBlockSpacing(blocks, pageHeight);
  }
  const columnBlocks = columns.map((col) => blocksFromLines(clusterLines(col), pageWidth));
  const allColumnBlocks = columnBlocks.flat();
  blocks.push({
    kind: 'columns',
    columns: columnBlocks,
    widthsPt,
    x,
    top: Math.max(...allColumnBlocks.map((block) => blockTop(block) ?? 0)),
    bottom: Math.min(...allColumnBlocks.map((block) => blockBottom(block) ?? pageHeight)),
  });
  return addBlockSpacing(blocks, pageHeight);
}

export function pageCharCount(lines: PdfTextLine[]): number {
  return lines.reduce((n, line) => n + line.text.replace(/\s/g, '').length, 0);
}
