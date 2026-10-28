import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  await page.goto("http://127.0.0.1:5173/#/tool/scan");
  const choose = async (selector, mb) =>
    page.evaluate(
      async ({ selector, mb }) => {
        const c = document.createElement("canvas");
        c.width = 10;
        c.height = 10;
        const b = await new Promise((r) => c.toBlob(r, "image/jpeg"));
        const bytes = new Uint8Array(mb * 1024 * 1024);
        bytes.set(new Uint8Array(await b.arrayBuffer()));
        const dt = new DataTransfer();
        dt.items.add(
          new File([bytes], "synthetic-budget.jpg", { type: "image/jpeg" }),
        );
        const input = document.querySelector(selector);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { selector, mb },
    );
  await page
    .locator(".scan-cam input[type=file]")
    .waitFor({ state: "attached" });
  await choose(".scan-cam input[type=file]", 65);
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  await choose(".scan-edit input[type=file]", 65);
  await page
    .locator(".scan-edit")
    .getByRole("alert")
    .filter({ hasText: "128 MB" })
    .waitFor();
  assert.equal(
    await page.locator(".scan-edit__slide img").count(),
    1,
    "ToolFlow gallery preserves previous pages",
  );
  await page.getByRole("button", { name: "Return to camera" }).click();
  await page
    .locator(".scan-cam input[type=file]")
    .waitFor({ state: "attached" });
  await choose(".scan-cam input[type=file]", 65);
  await page
    .locator(".scan-cam")
    .getByRole("status")
    .filter({ hasText: "128 MB" })
    .waitFor();
  assert.equal(
    await page.locator(".scan-cam").count(),
    1,
    "Browser camera refuses oversized append without closing",
  );
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  // Parent retake must account for ALL existing pages, not the empty camera array.
  await choose(".scan-edit input[type=file]", 55);
  await page.waitForFunction(
    () => document.querySelectorAll(".scan-edit__slide img").length === 2,
  );
  const before = await page.evaluate(async () => {
    const { loadScanDraft } = await import("/src/store/scanDraft.ts");
    return (await loadScanDraft()).files.map((f) => f.bytes.length);
  });
  assert.deepEqual(before, [65 * 1024 * 1024, 55 * 1024 * 1024]);
  const box = await page.locator(".scan-edit__slide img").first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page
    .locator(".scan-cam input[type=file]")
    .waitFor({ state: "attached" });
  await choose(".scan-cam input[type=file]", 75);
  await page
    .locator(".scan-cam")
    .getByRole("status")
    .filter({ hasText: "128 MB" })
    .waitFor();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  const after = await page.evaluate(async () => {
    const { loadScanDraft } = await import("/src/store/scanDraft.ts");
    return (await loadScanDraft()).files.map((f) => f.bytes.length);
  });
  assert.deepEqual(
    after,
    before,
    "oversized retake preserves both old page bytes",
  );
  assert.equal(await page.locator(".scan-edit__slide img").count(), 2);
  console.log(
    "SCAN_BUDGET_BROWSER_OK actual ToolFlow and BrowserScanCamera repeated batches reject beforemutation",
  );
} finally {
  await browser.close();
}
