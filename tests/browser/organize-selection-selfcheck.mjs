import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { PDFDocument, rgb, degrees } from "pdf-lib";
const doc = await PDFDocument.create();
for (let i = 0; i < 40; i++) {
  const p = doc.addPage([300, 400]);
  p.drawText(`PAGE_${i + 1}`, { x: 30, y: 350, size: 25, color: rgb(0, 0, 0) });
  if (i === 2) p.setRotation(degrees(90));
}
const bytes = Buffer.from(await doc.save());
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const url = "http://127.0.0.1:5173/#/tool/organize";
  const choose = (payload) =>
    page.locator("input[type=file]").setInputFiles(payload);
  const payload = {
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  };
  const tapOnly = async (pages) => {
    await page.getByRole("button", { name: "Tap order", exact: true }).click();
    for (const n of pages)
      await page
        .getByRole("button", { name: `Pick page ${n}`, exact: true })
        .click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  };
  const output = () =>
    page.evaluate(async () => {
      const { lastJob } = await import("/src/store/lastJob.ts");
      return [...lastJob.result.bytes];
    });
  await page.goto(url);
  await choose(payload);
  await page
    .getByRole("button", { name: "Leave out page 40", exact: true })
    .waitFor({ state: "attached" });
  assert.equal(
    await page
      .locator(".ps-organize-grid")
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
      ),
    3,
  );
  assert(
    await page
      .locator(".ps-organize-grid")
      .evaluate(
        (e) => e.scrollHeight > e.clientHeight && e.clientHeight <= 520,
      ),
  );
  assert.equal(await page.locator(".ps-organize-number").count(), 40);
  assert(
    await page
      .getByRole("button", { name: "Organize", exact: true })
      .isEnabled(),
  );
  // Dragging page 1 onto page 3's slot moves it to position 3.
  const box = async (n) =>
    page.locator(`[data-page="${n}"] .ps-organize-preview`).boundingBox();
  const from = await box(0),
    to = await box(2);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  assert.equal(
    await page.locator('[data-page="0"] .ps-organize-number').textContent(),
    "3",
  );
  assert.equal(
    await page.locator('[data-page="1"] .ps-organize-number').textContent(),
    "1",
  );
  await page.getByRole("button", { name: "Reset to original" }).click();
  await page
    .locator(".ps-organize-grid")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForFunction(
    () => document.querySelector('img[alt="Page 40"]')?.naturalWidth > 0,
  );
  await page.getByRole("button", { name: "Tap order", exact: true }).click();
  await page
    .getByRole("button", { name: "Pick page 40", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pick page 2", exact: true })
    .click();
  assert.equal(
    await page.locator('[data-page="39"] .ps-organize-number').textContent(),
    "1",
  );
  assert.equal(
    await page.locator('[data-page="1"] .ps-organize-number').textContent(),
    "2",
  );
  for (const n of [40, 2])
    await page
      .getByRole("button", { name: `Unpick page ${n}`, exact: true })
      .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Tap order", exact: true }).click();
  await page
    .getByRole("button", { name: "Pick page 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pick page 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unpick page 3", exact: true })
    .click();
  assert.deepEqual(
    await page.locator(".ps-organize-number").allTextContents(),
    ["1"],
  );
  await page
    .getByRole("button", { name: "Pick page 3", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.locator(".ps-organize-number").count(), 2);
  await page.getByRole("button", { name: "Rotate page 3 clockwise" }).click();
  await page.screenshot({
    path: ".superpowers/sdd/2026-10-03-organize-selection/mobile.png",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(
    await page
      .locator(".ps-organize-grid")
      .evaluate(
        (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
      ),
    3,
  );
  await page.screenshot({
    path: ".superpowers/sdd/2026-10-03-organize-selection/desktop.png",
  });
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.waitForURL((u) => u.hash === "#/result");
  const result = await output();
  const out = await PDFDocument.load(new Uint8Array(result));
  assert.equal(out.getPageCount(), 2);
  assert.equal(out.getPage(0).getRotation().angle, 0);
  assert.equal(out.getPage(1).getRotation().angle, 180);
  const texts = await page.evaluate(async (bytes) => {
    const pdfjs = await import("/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const pdf = await task.promise;
    const text = [];
    for (let i = 1; i <= pdf.numPages; i++)
      text.push(
        (await (await pdf.getPage(i)).getTextContent()).items
          .map((x) => x.str)
          .join(" "),
      );
    await task.destroy();
    return text;
  }, result);
  assert.deepEqual(texts, ["PAGE_1", "PAGE_3"]);
  await page.goto(url);
  const png = async (color) =>
    Buffer.from(
      await page.evaluate(async (color) => {
        const c = new OffscreenCanvas(40, 60);
        c.getContext("2d").fillStyle = color;
        c.getContext("2d").fillRect(0, 0, 40, 60);
        return [
          ...new Uint8Array(
            await (await c.convertToBlob({ type: "image/png" })).arrayBuffer(),
          ),
        ];
      }, color),
    );
  const red = await png("red"),
    blue = await png("blue");
  await choose([
    { name: "red.png", mimeType: "", buffer: red },
    { name: "blue.png", mimeType: "application/octet-stream", buffer: blue },
  ]);
  await page
    .getByRole("button", { name: "Leave out page 2", exact: true })
    .waitFor();
  const previous = await page.locator(".ps-organize-number").allTextContents();
  await choose([payload, { name: "red.png", mimeType: "", buffer: red }]);
  await page.getByRole("alert").filter({ hasText: "not mixed" }).waitFor();
  assert.deepEqual(
    await page.locator(".ps-organize-number").allTextContents(),
    previous,
  );
  await page.getByRole("button", { name: "Organize", exact: true }).click();
  await page.waitForURL((u) => u.hash === "#/result");
  const colors = await page.evaluate(async () => {
    const { lastJob } = await import("/src/store/lastJob.ts");
    const pdfjs = await import("/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
    const task = pdfjs.getDocument({ data: lastJob.result.bytes.slice() });
    const pdf = await task.promise;
    const result = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i),
        v = p.getViewport({ scale: 1 }),
        c = document.createElement("canvas");
      c.width = v.width;
      c.height = v.height;
      await p.render({ canvasContext: c.getContext("2d"), viewport: v })
        .promise;
      result.push(
        [
          ...c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1)
            .data,
        ].slice(0, 3),
      );
    }
    await task.destroy();
    return result;
  });
  assert.deepEqual(colors, [
    [255, 0, 0],
    [0, 0, 255],
  ]);
  // Password cancellation preserves previous data; unsupported input never publishes.
  await page.goto(url);
  await choose(payload);
  await page
    .getByRole("button", { name: "Leave out page 3", exact: true })
    .waitFor();
  await tapOnly([3]);
  const encrypted = Buffer.from(
    await page.evaluate(
      async (bytes) => {
        const { protectPdf } = await import("/src/pdf/protectPdf.ts");
        return [
          ...(await protectPdf(new Uint8Array(bytes), "fixture-password")),
        ];
      },
      [...bytes],
    ),
  );
  await choose({
    name: "encrypted.pdf",
    mimeType: "application/pdf",
    buffer: encrypted,
  });
  await page.getByRole("form", { name: "Unlock PDF" }).waitFor();
  await page
    .getByRole("form", { name: "Unlock PDF" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  assert(
    await page
      .getByRole("button", { name: "Organize", exact: true })
      .isEnabled(),
  );
  await choose({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await page.getByRole("alert").waitFor();
  assert.deepEqual(
    await page.locator(".ps-organize-number").allTextContents(),
    ["1"],
  );
  await choose({
    name: "encrypted.pdf",
    mimeType: "application/pdf",
    buffer: encrypted,
  });
  await page.getByLabel("Document password").fill("wrong");
  await page.getByRole("button", { name: "Unlock PDF", exact: true }).click();
  await page.getByText("That password was incorrect. Try again.").waitFor();
  await page.getByLabel("Document password").fill("fixture-password");
  await page.getByRole("button", { name: "Unlock PDF", exact: true }).click();
  // A newly unlocked document starts with every page kept. The previous
  // document stays on screen until the unlocked one is ready, so wait for it.
  await page.waitForFunction(
    () => document.querySelectorAll(".ps-organize-number").length === 40,
  );
  // Retained-origin suspension cancels preparation/password and recovers old selection.
  await page.goto(
    "http://127.0.0.1:5173/tests/browser/fixtures/native-camera-presentation.html",
  );
  const fixture = await page.evaluateHandle(
    () => import("/tests/browser/fixtures/native-camera-presentation.tsx"),
  );
  const call = (method, ...args) =>
    fixture.evaluate((m, { method, args }) => m[method](...args), {
      method,
      args,
    });
  await call("mount", "#/tool/organize");
  await choose(payload);
  await page
    .getByRole("button", { name: "Leave out page 3", exact: true })
    .waitFor();
  await tapOnly([3]);
  await choose({
    name: "encrypted.pdf",
    mimeType: "application/pdf",
    buffer: encrypted,
  });
  await page.getByRole("form", { name: "Unlock PDF" }).waitFor();
  await call("scan");
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .waitFor();
  await call("cancelled");
  await page.waitForURL((u) => u.hash === "#/tool/organize");
  await page.waitForFunction(
    () =>
      !![...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Organize" && !b.disabled,
      ),
  );
  assert.equal(await page.getByRole("form", { name: "Unlock PDF" }).count(), 0);
  assert.deepEqual(
    await page.locator(".ps-organize-number").allTextContents(),
    ["1"],
  );
  await call("unmount");
  console.log(
    "ORGANIZE_SELECTION_OK drag,taporder,actualPDFtext1→3 selected-only source+individualrotation, imagered→blue,40row3colscroll,passwordwrong/cancel,invalidpreserves,retainedorigincleanup",
  );
} finally {
  await browser.close();
}
