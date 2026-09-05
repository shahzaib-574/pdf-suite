import { chromium } from "playwright-core";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { buildMinimalDocx } from "../../src/pdf/docxToPdf.test.ts";
const dir = path.resolve("tmp/browser-qa");
await mkdir(dir, { recursive: true });
const fixture = await PDFDocument.create();
const font = await fixture.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 4; i++)
  fixture
    .addPage([612, 792])
    .drawText(`Browser test page ${i}. Customer SN12345. Total 1240.`, {
      x: 40,
      y: 700,
      size: 16,
      font,
    });
const pdf = path.join(dir, "fixture.pdf");
await writeFile(pdf, await fixture.save());
const docx = path.join(dir, "fixture.docx");
await writeFile(
  docx,
  await buildMinimalDocx([
    "Browser conversion fixture",
    "Customer SN12345, amount 1240.",
  ]),
);
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const failures = [],
  results = [],
  errors = [],
  external = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE_ERROR", e.message);
});
page.on("request", (r) => {
  if (/^https?:/.test(r.url()) && !r.url().startsWith("http://127.0.0.1:5173/"))
    external.push(r.url());
});
const tools = [
  ["merge", "Merge PDFs"],
  ["split", "Extract pages"],
  ["images", "Create PDF"],
  ["scan", "Save PDF"],
  ["compress", "Compress PDF"],
  ["organize", "Apply page changes"],
  ["watermark", "Add watermark"],
  ["numbers", "Add page numbers"],
  ["protect", "Protect PDF"],
  ["pdf-images", "Export images"],
  ["docx-pdf", "Convert to PDF"],
  ["pdf-docx", "Convert to Word"],
  ["view", ""],
];
try {
  for (const [id, action] of tools) {
    try {
      await page.goto(`http://127.0.0.1:5173/#/tool/${id}`);
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles(
          id === "merge"
            ? [pdf, pdf]
            : id === "docx-pdf"
              ? docx
              : ["scan", "images"].includes(id)
                ? path.resolve("store-assets/graphics/app-icon-512.png")
                : pdf,
        );
      if (id === "scan") {
        await page.getByRole("button", { name: "Next", exact: true }).click();
      }
      if (id === "watermark")
        await page.getByLabel("Text", { exact: true }).fill("REVIEW");
      if (id === "protect") {
        await page
          .locator("input[autocomplete=new-password]")
          .nth(0)
          .fill(" secret ");
        await page
          .locator("input[autocomplete=new-password]")
          .nth(1)
          .fill(" secret ");
      }
      if (id === "view") {
        await page
          .getByRole("heading", { name: "Reader", exact: true })
          .waitFor();
        await page
          .locator(".ps-reader-page img")
          .first()
          .waitFor({ state: "visible" });
        results.push({ id, status: "PASS" });
        console.log("PASS", id);
        continue;
      }
      await page.getByRole("button", { name: action, exact: true }).click();
      await page
        .getByRole("heading", { name: "Result ready", exact: true })
        .waitFor({ timeout: 60000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Horizontal overflow",
      );
      if (["scan", "pdf-docx", "pdf-images"].includes(id))
        await page.screenshot({
          path: path.join(dir, `${id}-mobile.png`),
          fullPage: true,
        });
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: /^Save (PDF|Word file|ZIP|image)$/ })
        .click();
      const download = await downloadPromise;
      const out = path.join(dir, `${id}-${download.suggestedFilename()}`);
      await download.saveAs(out);
      const bytes = await readFile(out);
      assert(bytes.length > 0);
      if (id === "pdf-images")
        assert.equal(
          Object.keys((await JSZip.loadAsync(bytes)).files).length,
          4,
        );
      else if (id === "pdf-docx")
        assert(
          (
            await (
              await JSZip.loadAsync(bytes)
            )
              .file("word/document.xml")
              .async("string")
          ).includes("SN12345"),
        );
      else if (id !== "protect")
        assert((await PDFDocument.load(bytes)).getPageCount() > 0);
      if (id === "protect") {
        await page
          .getByRole("button", { name: "Open PDF", exact: true })
          .click();
        await page.getByLabel("Document password").fill("wrong");
        await page
          .getByRole("button", { name: "Open PDF", exact: true })
          .click();
        await page
          .getByText("That password was incorrect. Try again.")
          .waitFor();
        await page.getByLabel("Document password").fill(" secret ");
        await page
          .getByRole("button", { name: "Open PDF", exact: true })
          .click();
        await page
          .locator(".ps-reader-page img")
          .first()
          .waitFor({ state: "visible" });
      }
      results.push({ id, status: "PASS", bytes: bytes.length });
      console.log("PASS", id, bytes.length);
    } catch (e) {
      failures.push({ id, error: e.message });
      console.log("FAIL", id, e.message);
      await page
        .screenshot({
          path: path.join(dir, `${id}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
    }
  }
  await writeFile(
    path.join(dir, "ui-report.json"),
    JSON.stringify({ results, failures, errors, external }, null, 2),
  );
  console.log(
    "SUMMARY",
    JSON.stringify({ passed: results.length, failures, errors, external }),
  );
  if (failures.length || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
