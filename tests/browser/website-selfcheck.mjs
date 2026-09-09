import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.REAM_TEST_URL || 'http://localhost:5174';
await mkdir('tmp/website-review', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('.web-tool').last().waitFor();
  assert.equal(await page.locator('.web-tool').count(), 13);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  assert.equal(await page.locator('.web-tool').count(), 4);
  await page.getByRole('button', { name: 'All tools', exact: true }).click();
  await page.getByRole('searchbox').fill('word');
  assert.equal(await page.locator('.web-tool').count(), 2);
  await page.getByRole('searchbox').fill('nonexistent');
  await page.getByRole('heading', { name: 'No tools found' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.screenshot({ path: 'tmp/website-review/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Use dark theme' }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.screenshot({ path: 'tmp/website-review/dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Use light theme' }).click();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    if (width === 390) await page.screenshot({ path: 'tmp/website-review/mobile.png', fullPage: true });
  }
  const links = await page.locator('.web-tool').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  for (const link of links) {
    await page.goto(base + '/' + link);
    if (link.endsWith('/scan')) {
      await page.locator('.scan-cam').waitFor();
      continue;
    }
    await page.locator('.ps-screen').first().waitFor();
    assert.ok(await page.locator('h1').count(), `Heading missing: ${link}`);
  }
  await page.goto(base + '/#/tool/merge');
  const inputs = [];
  for (let i = 0; i < 2; i++) {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText(`Ream website test ${i + 1}`);
    inputs.push({ name: `sample-${i + 1}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  }
  await page.locator('input[type=file]').setInputFiles(inputs);
  await page.getByRole('button', { name: 'Merge PDFs', exact: true }).click();
  await page.waitForURL('**/#/result');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /save/i }).first().click();
  const download = await downloadPromise;
  const merged = await PDFDocument.load(await readFile(await download.path()));
  assert.equal(merged.getPageCount(), 2);
  assert.deepEqual(errors, []);
  console.log('PASS website: 13 routes, filters, search, themes, four viewport widths, two-page merge and real download.');
} finally {
  await browser.close();
}
