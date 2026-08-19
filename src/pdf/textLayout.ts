import type { PdfBlock, PdfTextLine, TextGlyph } from './textTypes';

function avgY(row: TextGlyph[]): number {
  return row.reduce((sum, g) => sum + g.y, 0) / row.length;
}

function glyphWidth(g: TextGlyph): number {
  if (g.width > 0 && Number.isFinite(g.width)) return g.width;
  return Math.max(g.size * 0.4, g.str.length * g.size * 0.45);
}

function joinGlyphs(glyphs: TextGlyph[]): string {
  const ordered = [...glyphs].sort((a, b) => a.x - b.x);
  let text = '';
  let lastRight = Number.NEGATIVE_INFINITY;
  for (const g of ordered) {
    const gap = g.x - lastRight;
    const spaceGap = Math.max(0.9, g.size * 0.14);
    if (text.length > 0) {
      const prev = text[text.length - 1];
      const next = g.str[0];
      const already =
        prev === ' ' ||
        prev === '\n' ||
        next === ' ' ||
        next === ',' ||
        next === '.' ||
        next === ';' ||
        next === ':';
      if (!already && gap > spaceGap) text += ' ';
    }
    text += g.str;
    lastRight = g.x + glyphWidth(g);
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\s+$/g, '').trim();
}

function tokenGroups(row: TextGlyph[]): TextGlyph[][] {
  const ordered = [...row].sort((a, b) => a.x - b.x);
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

function tokensFromRow(row: TextGlyph[]): { text: string; x: number; xEnd: number }[] {
  return tokenGroups(row)
    .map((group) => {
      const last = group[group.length - 1]!;
      return {
        text: joinGlyphs(group),
        x: group[0]!.x,
        xEnd: last.x + glyphWidth(last),
      };
    })
    .filter((t) => t.text.length > 0);
}

function joinLine(row: TextGlyph[]): PdfTextLine | undefined {
  const ordered = [...row].sort((a, b) => a.x - b.x);
  const text = joinGlyphs(ordered);
  if (!text) return undefined;
  const last = ordered[ordered.length - 1]!;
  const tokens = tokensFromRow(ordered);
  const cells = tokens.map((t) => t.text);
  return {
    text,
    fontSize: ordered.reduce((m, g) => Math.max(m, g.size), 11),
    x: ordered[0]!.x,
    y: avgY(ordered),
    xEnd: last.x + glyphWidth(last),
    cells: cells.length >= 2 ? cells : [text],
    tokens,
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

export function glyphFromPdfItem(item: unknown): TextGlyph | undefined {
  if (typeof item !== 'object' || item === null) return undefined;
  const rec = item as Record<string, unknown>;
  if (typeof rec.str !== 'string' || rec.str.length === 0) return undefined;
  const transform = rec.transform;
  if (!Array.isArray(transform) || transform.length < 6) return undefined;
  const x = Number(transform[4]);
  const y = Number(transform[5]);
  const a = Number(transform[0]);
  const d = Number(transform[3]);
  const size = Math.abs(d) || Math.abs(a) || 11;
  const width = Number(rec.width);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return {
    str: rec.str,
    x,
    y,
    width: Number.isFinite(width) && width > 0 ? width : 0,
    size,
    eol: rec.hasEOL === true,
  };
}

function paraFromLines(lines: PdfTextLine[]): PdfBlock[] {
  if (lines.length === 0) return [];
  const sizes = lines.map((l) => l.fontSize).sort((a, b) => a - b);
  const typical = sizes[Math.floor((sizes.length - 1) * 0.35)] ?? 11;
  const headingSize = Math.max(typical * 1.35, typical + 2.5);
  const groups: Extract<PdfBlock, { kind: 'para' }>[] = [];
  for (const line of lines) {
    const heading = line.fontSize >= headingSize && line.text.length < 90;
    const prev = groups[groups.length - 1];
    const sameIndent = prev
      ? Math.abs(prev.x - line.x) < Math.max(8, line.fontSize)
      : false;
    const sameKind = prev ? prev.heading === heading : false;
    if (prev && sameKind && sameIndent && !heading) {
      prev.lines.push({ text: line.text, fontSize: line.fontSize });
    } else {
      groups.push({
        kind: 'para',
        lines: [{ text: line.text, fontSize: line.fontSize }],
        heading,
        x: line.x,
      });
    }
  }
  return groups;
}

function clusterAnchors(
  xs: number[],
  eps = 12,
): { x: number; count: number }[] {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const groups: number[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const x = sorted[i]!;
    const group = groups[groups.length - 1]!;
    if (x - group[group.length - 1]! > eps) groups.push([x]);
    else group.push(x);
  }
  return groups
    .map((group) => ({
      x: group.reduce((a, b) => a + b, 0) / group.length,
      count: group.length,
    }))
    .filter((a) => a.count >= 2);
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
    if (bestD > 26) continue;
    const prev = cells[best] ?? '';
    cells[best] = prev ? `${prev} ${token.text}` : token.text;
  }
  return cells;
}

function alignedTable(lines: PdfTextLine[]): PdfBlock | undefined {
  const xs = lines.flatMap((line) =>
    (line.tokens.length > 0 ? line.tokens : [{ x: line.x }]).map((t) => t.x),
  );
  const anchors = clusterAnchors(xs);
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
  return { kind: 'table', rows };
}

function tableFromRun(run: PdfTextLine[]): PdfBlock | undefined {
  const aligned = alignedTable(run);
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
): { table: PdfBlock; next: number } | undefined {
  const rows: string[][] = [];
  let i = start;
  let lastY = lines[start]?.y ?? 0;
  while (i < lines.length) {
    const line = lines[i]!;
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
        last[col] = `${last[col] ?? ''} ${cells[col]}`.trim();
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
  return { table: { kind: 'table', rows }, next: i };
}

export function blocksFromLines(lines: PdfTextLine[]): PdfBlock[] {
  const ordered = [...lines].sort((a, b) => b.y - a.y || a.x - b.x);
  const xs = ordered.flatMap((line) =>
    (line.tokens.length > 0 ? line.tokens : [{ x: line.x }]).map((t) => t.x),
  );
  const anchors = clusterAnchors(xs);
  if (anchors.length < 2) {
    const fallback = tableFromRun(ordered);
    if (fallback) return [fallback];
    return paraFromLines(ordered);
  }
  const out: PdfBlock[] = [];
  let i = 0;
  while (i < ordered.length) {
    const cells = assignCells(ordered[i]!, anchors);
    const filled = cells.filter((c) => c.length > 0).length;
    if (filled >= 2) {
      const taken = consumeTable(ordered, i, anchors);
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
    out.push(...paraFromLines(ordered.slice(start, i)));
  }
  return out;
}

function splitGlyphColumns(
  glyphs: TextGlyph[],
  pageWidth: number,
): { header: TextGlyph[]; columns: TextGlyph[][] } {
  if (glyphs.length < 6 || pageWidth < 200) {
    return { header: [], columns: [glyphs] };
  }
  const minX = Math.min(...glyphs.map((g) => g.x));
  const maxX = Math.max(...glyphs.map((g) => g.x + glyphWidth(g)));
  const inner = maxX - minX;
  if (inner < 140) return { header: [], columns: [glyphs] };
  const bins = 48;
  const hits = new Array<number>(bins).fill(0);
  for (const g of glyphs) {
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
  const left = glyphs.filter((g) => g.x + glyphWidth(g) <= splitX + 3);
  const right = glyphs.filter((g) => g.x >= splitX - 3);
  const header = glyphs.filter(
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
  return { header, columns: [left, right] };
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
): { header: PdfTextLine[]; columns: PdfTextLine[][] } {
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
  return { header, columns: [left, right] };
}

export function analyzePage(
  lines: PdfTextLine[],
  pageWidth: number,
): PdfBlock[] {
  if (lines.length === 0) return [];
  const { header, columns } = splitColumns(lines, pageWidth);
  const blocks: PdfBlock[] = [...paraFromLines(header)];
  if (columns.length <= 1) {
    blocks.push(...blocksFromLines(columns[0] ?? lines));
    return blocks;
  }
  blocks.push({
    kind: 'columns',
    columns: columns.map((col) => blocksFromLines(col)),
  });
  return blocks;
}

export function analyzeGlyphs(
  glyphs: TextGlyph[],
  pageWidth: number,
): PdfBlock[] {
  if (glyphs.length === 0) return [];
  const { header, columns } = splitGlyphColumns(glyphs, pageWidth);
  const blocks: PdfBlock[] = [...paraFromLines(clusterLines(header))];
  if (columns.length <= 1) {
    blocks.push(...blocksFromLines(clusterLines(columns[0] ?? glyphs)));
    return blocks;
  }
  blocks.push({
    kind: 'columns',
    columns: columns.map((col) => blocksFromLines(clusterLines(col))),
  });
  return blocks;
}

export function pageCharCount(lines: PdfTextLine[]): number {
  return lines.reduce((n, line) => n + line.text.replace(/\s/g, '').length, 0);
}
