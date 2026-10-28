import { chromium } from "playwright-core";
import assert from "node:assert/strict";

// Compress keeps text and transparency while shrinking embedded images.
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:5173/");
  const result = await page.evaluate(async () => {
    const m = await import("/node_modules/pdf-lib/dist/pdf-lib.esm.js");
    const { engine } = await import("/src/pdf/index.ts");
    const pdfjs = await import("/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";

    // Deterministic photo-like content: gradient, discs and fine noise.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const photo = (w, h, alpha) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d");
      if (!alpha) {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, "#3a6ea5");
        gr.addColorStop(1, "#e8c07d");
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
      for (let i = 0; i < 250; i++) {
        g.fillStyle = `hsla(${rand() * 360},60%,50%,${alpha ? rand() : 0.4})`;
        g.beginPath();
        g.arc(rand() * w, rand() * h, 20 + rand() * 180, 0, 7);
        g.fill();
      }
      if (!alpha) {
        const id = g.getImageData(0, 0, w, h);
        for (let i = 0; i < id.data.length; i += 4) {
          const n = (rand() - 0.5) * 24;
          id.data[i] += n;
          id.data[i + 1] += n;
          id.data[i + 2] += n;
        }
        g.putImageData(id, 0, 0);
      }
      return c;
    };
    const blobBytes = async (c, type, quality) =>
      new Uint8Array(await (await c.convertToBlob({ type, quality })).arrayBuffer());

    const doc = await m.PDFDocument.create();
    const font = await doc.embedFont(m.StandardFonts.Helvetica);
    const first = doc.addPage([595, 842]);
    first.drawImage(await doc.embedJpg(await blobBytes(photo(2400, 3200), "image/jpeg", 0.95)), {
      x: 0, y: 0, width: 595, height: 842,
    });
    first.drawText("KEEP_TEXT_ONE", { x: 40, y: 40, size: 14, font });
    const second = doc.addPage([595, 842]);
    second.drawImage(await doc.embedPng(await blobBytes(photo(1600, 2000), "image/png")), {
      x: 40, y: 200, width: 515, height: 600,
    });
    second.drawImage(await doc.embedPng(await blobBytes(photo(1200, 1200, true), "image/png")), {
      x: 100, y: 100, width: 300, height: 300,
    });
    second.drawText("KEEP_TEXT_TWO", { x: 40, y: 60, size: 14, font });
    const source = await doc.save();

    const text = async (bytes) => {
      const task = pdfjs.getDocument({ data: bytes.slice() });
      const pdf = await task.promise;
      const out = [];
      for (let i = 1; i <= pdf.numPages; i++)
        out.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(" "));
      await task.destroy();
      return out;
    };
    const images = async (bytes) => {
      const loaded = await m.PDFDocument.load(bytes);
      const list = [];
      for (const [, obj] of loaded.context.enumerateIndirectObjects()) {
        if (obj.dict?.get(m.PDFName.of("Subtype"))?.toString() !== "/Image") continue;
        list.push({
          filter: String(obj.dict.get(m.PDFName.of("Filter"))),
          width: obj.dict.get(m.PDFName.of("Width")).asNumber(),
          smask: !!obj.dict.get(m.PDFName.of("SMask")),
        });
      }
      return list;
    };

    const file = { name: "photos.pdf", mime: "application/pdf", bytes: source };
    const recommended = await engine.compress(file, "keep");
    const strong = await engine.compress(file, "balanced");

    const plain = await m.PDFDocument.create();
    const plainFont = await plain.embedFont(m.StandardFonts.Helvetica);
    plain.addPage([595, 842]).drawText("Only text", { x: 40, y: 700, size: 20, font: plainFont });
    const plainBytes = await plain.save();
    const textOnly = await engine.compress(
      { name: "text.pdf", mime: "application/pdf", bytes: plainBytes },
      "keep",
    );

    return {
      source: source.length,
      recommended: recommended.bytes.length,
      strong: strong.bytes.length,
      report: recommended.extra.compression,
      text: await text(recommended.bytes),
      images: await images(recommended.bytes),
      textOnlySame: textOnly.bytes.length === plainBytes.length,
      textOnlyRetained: textOnly.extra.compression.originalRetained,
    };
  });

  assert(result.recommended < result.source * 0.4, `recommended ${result.recommended} of ${result.source}`);
  assert(result.strong < result.recommended, "strong should be smaller than recommended");
  assert.equal(result.report.mode, "images");
  assert(result.report.imagesRecompressed >= 2);
  assert.deepEqual(result.text, ["KEEP_TEXT_ONE", "KEEP_TEXT_TWO"]);
  // A full-page A4 image is capped near 200 DPI (842pt / 72 * 200 = 2339px).
  assert(result.images.every((image) => image.width <= 2339));
  // The transparent image keeps its soft mask.
  assert(result.images.some((image) => image.smask));
  assert(result.textOnlySame && result.textOnlyRetained);
  console.log(
    `COMPRESS_OK ${result.source}B -> recommended ${result.recommended}B, strong ${result.strong}B; text, soft mask and text-only passthrough kept`,
  );
} finally {
  await browser.close();
}
