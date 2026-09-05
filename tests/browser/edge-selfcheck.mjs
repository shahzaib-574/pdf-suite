import { chromium } from "playwright-core";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import JSZip from "jszip";
const dir = path.resolve("tmp/browser-qa");
await mkdir(dir, { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 41; i++)
  pdf
    .addPage([612, 792])
    .drawText(`Page ${i}. Cancellation and export fixture.`, {
      x: 40,
      y: 700,
      size: 18,
      font,
    });
const fixture = path.join(dir, "forty-one.pdf");
await writeFile(fixture, await pdf.save());
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 320, height: 740 },
  colorScheme: "dark",
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = [];
const pass = (m) => {
  report.push(m);
  console.log("PASS", m);
};
const noOverflow = async () =>
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Horizontal overflow",
  );
try {
  await page.goto("http://127.0.0.1:5173/#/tool/pdf-images");
  await page.locator("input[type=file]").setInputFiles(fixture);
  await page
    .getByRole("button", { name: "Export images", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Document processing" }).waitFor();
  assert(await page.locator(".app-frame").evaluate((el) => el.inert));
  await page.getByRole("button", { name: "Cancel processing" }).click();
  await page
    .getByText(
      "Processing cancelled. Your selected files are ready to try again.",
    )
    .waitFor();
  assert(!(await page.locator(".app-frame").evaluate((el) => el.inert)));
  pass("UI cancellation releases focus lock and retains selected file");
  await page
    .getByRole("button", { name: "Export images", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Result ready" })
    .waitFor({ timeout: 60000 });
  await noOverflow();
  await page.getByLabel("File name", { exact: true }).fill("customer-images");
  assert(
    (await page.getByLabel("File name", { exact: true }).boundingBox())
      .height >= 48,
  );
  await page.screenshot({
    path: path.join(dir, "result-dark-320.png"),
    fullPage: true,
  });
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save ZIP", exact: true }).click();
  const downloaded = await dl;
  assert.equal(downloaded.suggestedFilename(), "customer-images.zip");
  const out = path.join(dir, "customer-images.zip");
  await downloaded.saveAs(out);
  assert.equal(
    Object.keys((await JSZip.loadAsync(await readFile(out))).files).length,
    41,
  );
  pass(
    "41-image ZIP downloads with edited name; dark 320px result has no overflow",
  );
  await page.goto("http://127.0.0.1:5173/#/recents");
  await page.getByLabel("Search files").fill("customer-images");
  await page
    .getByRole("button", { name: "Rename customer-images.zip", exact: true })
    .click();
  await page.getByLabel("File name", { exact: true }).fill("renamed-archive");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page.getByLabel("Search files").fill("renamed-archive");
  await page
    .getByRole("button", { name: "Rename renamed-archive.zip", exact: true })
    .waitFor();
  await noOverflow();
  await page.screenshot({
    path: path.join(dir, "recents-dark-320.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Remove renamed-archive.zip from Recents",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Remove local copy", exact: true })
    .click();
  await page.getByRole("heading", { name: "No files yet" }).waitFor();
  pass("Recents search, rename, and deletion");
  await page.goto("http://127.0.0.1:5173/#/settings");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await noOverflow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: path.join(dir, "settings-dark-desktop.png"),
    fullPage: true,
  });
  pass("Settings in dark theme at 320px and 1440px");
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(dir, "edge-report.json"),
    JSON.stringify({ report, errors }, null, 2),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({
    path: path.join(dir, "edge-failure.png"),
    fullPage: true,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
