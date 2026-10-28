import assert from "node:assert/strict";
import {
  appendScanPages,
  replaceScanPage,
  retainedScanBytes,
} from "../src/store/scanInputPolicy.ts";
import type { PickedFile } from "../src/lib/types.ts";
const photo = (mb: number, source = 0): PickedFile => ({
  name: "synthetic.jpg",
  mime: "image/jpeg",
  bytes: new Uint8Array(mb * 1024 * 1024),
  ...(source
    ? {
        scanSource: {
          name: "synthetic.webp",
          mime: "image/webp",
          bytes: new Uint8Array(source * 1024 * 1024),
        },
      }
    : {}),
});
const old = [photo(65)];
assert.throws(() => appendScanPages(old, [photo(65)], 20), /128 MB/);
assert.equal(old.length, 1);
const retained = [photo(60, 10)];
assert.equal(retainedScanBytes(retained), 70 * 1024 * 1024);
assert.throws(() => appendScanPages(retained, [photo(60)], 20), /128 MB/);
const previous = [photo(60), photo(60)];
assert.throws(() => replaceScanPage(previous, 0, photo(70)), /128 MB/);
assert.equal(previous[0]!.bytes.length, 60 * 1024 * 1024);
assert.equal(replaceScanPage(previous, 0, photo(5)).length, 2);
assert.throws(() => appendScanPages(old, [photo(1)], 1), /page limit/);
console.log(
  "SCAN_BUDGET_SELFCHECK_OK repeated batches retainedsources replacement limit immutable",
);
