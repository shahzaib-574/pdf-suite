import { chromium } from "playwright-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.addPage([2200, 3000]);
page.drawRectangle({
  x: 0,
  y: 0,
  width: 2200,
  height: 3000,
  color: rgb(0.97, 0.97, 0.94),
});
page.drawRectangle({
  x: 120,
  y: 900,
  width: 1960,
  height: 1200,
  color: rgb(0.08, 0.1, 0.22),
});
// The viewer keeps the zoom focal point near the page center. Put an
// unmistakable, multi-color target there so a screenshot of a correctly
// painted page cannot be confused with the reader's dark canvas background.
page.drawRectangle({
  x: 650,
  y: 1190,
  width: 900,
  height: 620,
  color: rgb(0.94, 0.96, 0.99),
});
page.drawRectangle({
  x: 790,
  y: 1360,
  width: 620,
  height: 250,
  color: rgb(0.9, 0.12, 0.1),
});
page.drawText("VISIBLE PDF CONTENT", {
  x: 835,
  y: 1450,
  size: 48,
  font,
  color: rgb(1, 1, 1),
});
for (let y = 40; y < 2960; y += 36) {
  page.drawText(`Heavy page line ${y}`, {
    x: 48,
    y,
    size: 22,
    font,
    color: rgb(0.12, 0.14, 0.2),
  });
}
const bytes = [...(await pdf.save())];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const view = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  await view.goto("http://127.0.0.1:5173");
  await view.evaluate(async (data) => {
    const { setCurrentViewer } = await import("/src/store/lastJob.ts");
    setCurrentViewer(new Uint8Array(data), "Heavy zoom.pdf");
    location.hash = "/viewer";
  }, bytes);
  await view.waitForFunction(
    () => document.querySelector(".ps-reader-page__surface img")?.complete,
  );
  for (let i = 0; i < 8; i++) {
    await view.getByRole("button", { name: "Zoom in" }).click();
  }
  await view.waitForFunction(() => {
    const pageEl = document.querySelector('[data-page-index="0"]');
    const viewport = document.querySelector(".ps-reader-viewport");
    if (!pageEl || !viewport) return false;
    const pageBox = pageEl.getBoundingClientRect();
    if (pageBox.width > 3800 || pageBox.height > 3800) return false;
    const viewBox = viewport.getBoundingClientRect();
    return [...pageEl.querySelectorAll(".ps-reader-page__detail")].some(
      (img) => {
        const box = img.getBoundingClientRect();
        return (
          img.complete &&
          img.naturalWidth > 0 &&
          box.right > viewBox.left &&
          box.left < viewBox.right &&
          box.bottom > viewBox.top &&
          box.top < viewBox.bottom
        );
      },
    );
  });
  const metrics = await view.evaluate(() => {
    const pageEl = document.querySelector('[data-page-index="0"]');
    const viewport = document.querySelector(".ps-reader-viewport");
    const box = pageEl.getBoundingClientRect();
    const viewBox = viewport.getBoundingClientRect();
    const images = [...pageEl.querySelectorAll("img")].map((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      className: img.className,
      w: img.getBoundingClientRect().width,
      h: img.getBoundingClientRect().height,
      visible: (() => {
        const imageBox = img.getBoundingClientRect();
        return (
          imageBox.right > viewBox.left &&
          imageBox.left < viewBox.right &&
          imageBox.bottom > viewBox.top &&
          imageBox.top < viewBox.bottom
        );
      })(),
    }));
    return {
      pageW: box.width,
      pageH: box.height,
      zoom: document.querySelector(".ps-reader-zoom__value")?.textContent,
      images,
    };
  });
  assert.ok(metrics.pageW <= 3800, `page CSS width ${metrics.pageW}`);
  assert.ok(metrics.pageH <= 3800, `page CSS height ${metrics.pageH}`);
  assert.ok(
    metrics.images.some(
      (img) =>
        img.className === "ps-reader-page__detail" &&
        img.complete &&
        img.naturalWidth > 8 &&
        img.w > 40 &&
        img.h > 40 &&
        img.visible,
    ),
    "zoomed page must keep a decoded detail tile intersecting the viewport",
  );

  const detailMime = await view
    .locator(".ps-reader-page__detail")
    .first()
    .evaluate(async (img) =>
      (await fetch(img.src)).headers.get("content-type"),
    );
  assert.equal(
    detailMime,
    "image/png",
    "PDF detail tiles should stay lossless",
  );

  const beforeZoom = metrics.zoom;
  const beforeTiles = await view.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll(".ps-reader-page__detail")].map((img) => [
        `${img.style.left}:${img.style.top}`,
        img.src,
      ]),
    ),
  );
  await view.locator(".ps-reader-viewport").dispatchEvent("wheel", {
    deltaY: -8,
    ctrlKey: true,
    clientX: 206,
    clientY: 450,
  });
  await view.waitForFunction(
    (previous) =>
      document.querySelector(".ps-reader-zoom__value")?.textContent !==
      previous,
    beforeZoom,
  );
  await view.waitForFunction((previous) => {
    const oldTiles = new Map(Object.entries(previous));
    return [...document.querySelectorAll(".ps-reader-page__detail")].some(
      (img) => {
        const old = oldTiles.get(`${img.style.left}:${img.style.top}`);
        return old && old !== img.src && img.complete && img.naturalWidth > 0;
      },
    );
  }, beforeTiles);

  await mkdir("tmp/browser-qa", { recursive: true });
  const screenshot = await view.screenshot({
    path: "tmp/browser-qa/viewer-heavy-zoom.png",
  });
  const painted = await view.evaluate(
    async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const viewport = document
        .querySelector(".ps-reader-viewport")
        .getBoundingClientRect();
      const scaleX = image.naturalWidth / window.innerWidth;
      const scaleY = image.naturalHeight / window.innerHeight;
      const x = Math.max(0, Math.floor(viewport.left * scaleX));
      const y = Math.max(0, Math.floor(viewport.top * scaleY));
      const width = Math.min(
        image.naturalWidth - x,
        Math.ceil(viewport.width * scaleX),
      );
      const height = Math.min(
        image.naturalHeight - y,
        Math.ceil(viewport.height * scaleY),
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      let redMarker = 0;
      let lightPanel = 0;
      const colorBins = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];
        if (red > 180 && green < 100 && blue < 100) redMarker += 1;
        if (red > 210 && green > 210 && blue > 210) lightPanel += 1;
        colorBins.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      }
      return { redMarker, lightPanel, colorBins: colorBins.size };
    },
    `data:image/png;base64,${screenshot.toString("base64")}`,
  );
  assert.ok(
    painted.redMarker > 1000,
    `visible screenshot must contain the red PDF marker, got ${painted.redMarker} pixels`,
  );
  assert.ok(
    painted.lightPanel > 1000,
    `visible screenshot must contain the light PDF panel, got ${painted.lightPanel} pixels`,
  );
  assert.ok(
    painted.colorBins > 12,
    `visible screenshot must contain varied PDF content, got ${painted.colorBins} color bins`,
  );
  console.log(
    "PASS: heavy page is visibly painted, detail is lossless, and exact-scale zoom refreshes tiles",
    beforeZoom,
  );
} finally {
  await browser.close();
}
