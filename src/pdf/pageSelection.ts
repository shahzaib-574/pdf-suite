export function parsePages(value: string, count: number): number[] {
  if (!Number.isInteger(count) || count < 1)
    throw new Error("Wait for the PDF page count.");
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i);
  const output: number[] = [];
  const seen = new Set<number>();
  for (const token of value.split(",")) {
    const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw new Error("Use page numbers and ranges, for example 1-3, 5, 8-10.");
    const from = Number(match[1]),
      to = Number(match[2] ?? match[1]);
    if (from < 1 || to > count || from > to)
      throw new Error(
        `Choose pages between 1 and ${count}, with ranges in ascending order.`,
      );
    for (let n = from - 1; n < to; n++)
      if (!seen.has(n)) {
        seen.add(n);
        output.push(n);
      }
  }
  return output;
}
