import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const dir = path.resolve("tmp/browser-qa");
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: "chrome" }),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1200, height: 900 },
});
// This harness verifies document processing, not Vite's development reload client.
await context.routeWebSocket("**", (socket) => socket.close());
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(e.message);
  console.log("PAGE_ERROR", e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE_ERROR", m.text());
});
try {
  await page.goto("http://127.0.0.1:5173/tests/browser/engine.html");
  await page.getByRole("button", { name: "Run engine checks" }).click();
  let last = "";
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    const text = await page.locator("#results").innerText();
    if (text !== last) {
      console.log(text.startsWith(last) ? text.slice(last.length) : text);
      last = text;
    }
    if (await page.locator("#results").getAttribute("data-complete")) break;
    if (await page.locator("#results").getAttribute("data-failed"))
      throw new Error(text);
    await page.waitForTimeout(1000);
  }
  if (!(await page.locator("#results").getAttribute("data-complete")))
    throw new Error("Engine timeout");
  if (pageErrors.length) throw new Error(pageErrors.join("; "));
  await page.screenshot({
    path: path.join(dir, "engine-results.png"),
    fullPage: true,
  });
  await writeFile(
    path.join(dir, "engine-result.txt"),
    await page.locator("#results").innerText(),
  );
} catch (e) {
  await page.screenshot({
    path: path.join(dir, "engine-failure.png"),
    fullPage: true,
  });
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
