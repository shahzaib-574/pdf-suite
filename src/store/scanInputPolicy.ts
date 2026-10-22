import type { PickedFile } from "../lib/types";
export const SCAN_RETAINED_LIMIT = 128 * 1024 * 1024;
export function retainedScanBytes(files: readonly PickedFile[]): number {
  return files.reduce(
    (sum, file) =>
      sum +
      file.bytes.length +
      (file.scanSource && file.scanSource.bytes !== file.bytes
        ? file.scanSource.bytes.length
        : 0),
    0,
  );
}
export function assertScanBudget(
  files: readonly PickedFile[],
  maxPages: number,
): void {
  if (files.length > maxPages || retainedScanBytes(files) > SCAN_RETAINED_LIMIT)
    throw new Error(
      "This scan exceeds the page limit or 128 MB including retained originals. Remove photos or use a smaller replacement.",
    );
}
export function appendScanPages(
  pages: readonly PickedFile[],
  incoming: readonly PickedFile[],
  maxPages: number,
): PickedFile[] {
  const next = [...pages, ...incoming];
  assertScanBudget(next, maxPages);
  return next;
}
export function replaceScanPage(
  pages: readonly PickedFile[],
  index: number,
  replacement: PickedFile,
): PickedFile[] {
  const next = pages.map((page, i) => (i === index ? replacement : page));
  assertScanBudget(next, pages.length);
  return next;
}
