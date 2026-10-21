import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    "http://127.0.0.1:5173/tests/browser/fixtures/tools-banner-slot.html",
  );
  const data = await page.evaluate(async () => {
    const { fileListToScanImages, ensureJpegOrPng } =
      await import("/src/store/files.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 4032;
    canvas.height = 3024;
    canvas.getContext("2d").fillRect(0, 0, 4032, 3024);
    const jpg = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 1)),
      png = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const files = [
      new File([jpg], "synthetic.jpg", { type: "image/jpeg" }),
      new File([png], "synthetic.png", { type: "image/png" }),
    ];
    const scan = await fileListToScanImages(files);
    const result = [];
    for (let i = 0; i < scan.length; i++) {
      const original = new Uint8Array(await files[i].arrayBuffer());
      const bitmap = await createImageBitmap(
        new Blob([scan[i].bytes], { type: scan[i].mime }),
      );
      result.push({
        same:
          original.length === scan[i].bytes.length &&
          original.every((x, j) => x === scan[i].bytes[j]),
        size: [bitmap.width, bitmap.height],
      });
      bitmap.close();
    }
    const generic = await ensureJpegOrPng(scan[0]);
    const bitmap = await createImageBitmap(
      new Blob([generic.bytes], { type: generic.mime }),
    );
    const genericSize = [bitmap.width, bitmap.height];
    bitmap.close();
    const abort = new AbortController();
    abort.abort();
    let abortName = "";
    try {
      await fileListToScanImages(files, { signal: abort.signal });
    } catch (e) {
      abortName = e.name;
    }
    let empty = false;
    try {
      await fileListToScanImages([
        new File([], "empty.jpg", { type: "image/jpeg" }),
      ]);
    } catch {
      empty = true;
    }
    // Synthetic mixed batch: small compressed WebP expands; following unchanged JPEG must
    // still be included in aggregate accounting. No photos or screenshots are persisted.
    const noise = document.createElement("canvas");
    noise.width = 1000;
    noise.height = 1000;
    const nx = noise.getContext("2d"),
      pixels = nx.createImageData(1000, 1000);
    let seed = 17;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    nx.putImageData(pixels, 0, 0);
    const webp = await new Promise((r) => noise.toBlob(r, "image/webp", 0.7));
    const tiny = document.createElement("canvas");
    tiny.width = 10;
    tiny.height = 10;
    const jpeg = await new Promise((r) => tiny.toBlob(r, "image/jpeg"));
    const padded = new Uint8Array(126 * 1024 * 1024);
    padded.set(new Uint8Array(await jpeg.arrayBuffer()));
    let mixedRejected = false;
    try {
      await fileListToScanImages([
        new File([webp], "synthetic.webp", { type: "image/webp" }),
        new File([padded], "padded-synthetic.jpg", { type: "image/jpeg" }),
      ]);
    } catch (e) {
      mixedRejected = /128/.test(e.message);
    }
    const orientCanvas = document.createElement("canvas");
    orientCanvas.width = 120;
    orientCanvas.height = 80;
    const small = new Uint8Array(
      await (
        await new Promise((r) => orientCanvas.toBlob(r, "image/jpeg", 1))
      ).arrayBuffer(),
    );
    const exif = new Uint8Array([
      255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
      18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const oriented = new Uint8Array(small.length + exif.length);
    oriented.set(small.subarray(0, 2));
    oriented.set(exif, 2);
    oriented.set(small.subarray(2), 2 + exif.length);
    const rotated = (
      await fileListToScanImages([
        new File([oriented], "synthetic-exif6.jpg", { type: "image/jpeg" }),
      ])
    )[0];
    const rotatedBitmap = await createImageBitmap(
      new Blob([rotated.bytes], { type: rotated.mime }),
    );
    const rotatedSize = [rotatedBitmap.width, rotatedBitmap.height];
    rotatedBitmap.close();
    const rotatedSame =
      oriented.length === rotated.bytes.length &&
      oriented.every((x, i) => x === rotated.bytes[i]);
    const huge = new OffscreenCanvas(8001, 4000);
    huge.getContext("2d").fillRect(0, 0, 8001, 4000);
    const hugeBlob = await huge.convertToBlob({ type: "image/png" });
    huge.width = 1;
    huge.height = 1;
    let pixelRejected = false;
    try {
      await fileListToScanImages([
        new File([hugeBlob], "synthetic-over32mp.png", { type: "image/png" }),
      ]);
    } catch (e) {
      pixelRejected = /32 megapixel/.test(e.message);
    }
    return {
      result,
      genericSize,
      abortName,
      empty,
      mixedRejected,
      rotatedSame,
      rotatedSize,
      pixelRejected,
    };
  });
  assert.deepEqual(data.result, [
    { same: true, size: [4032, 3024] },
    { same: true, size: [4032, 3024] },
  ]);
  assert.deepEqual(data.genericSize, [3200, 2400]);
  assert.equal(data.abortName, "AbortError");
  assert.equal(data.empty, true);
  assert.equal(data.rotatedSame, true);
  assert.deepEqual(data.rotatedSize, [80, 120]);
  assert.equal(data.pixelRejected, true);
  assert.equal(
    data.mixedRejected,
    true,
    "converted plus unchanged originals cannot exceed aggregate128MB",
  );
  console.log(
    "NATIVE_CAMERA_REPAIRS_BROWSER_OK scanJPEGPNG full-original bytes genericcap unchanged abort empty",
  );
} finally {
  await browser.close();
}
