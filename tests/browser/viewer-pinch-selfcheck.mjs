import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 3; i++) {
  const page = pdf.addPage([600, 800]);
  for (let y = 40; y < 780; y += 24) page.drawText(`Page ${i + 1}: sharp vector text and fine lines`, { x: 30, y, size: 12, font });
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  await page.goto('http://127.0.0.1:5173');
  await page.evaluate(async bytes => {
    const { setCurrentViewer } = await import('/src/store/lastJob.ts');
    setCurrentViewer(new Uint8Array(bytes), 'Pinch regression.pdf');
    location.hash = '/viewer';
  }, [...await pdf.save()]);
  await page.waitForFunction(() => document.querySelectorAll('.ps-reader-page__surface img').length >= 2);
  await page.evaluate(() => {
    const viewport = document.querySelector('.ps-reader-viewport');
    const second = document.querySelector('[data-page-index="1"]');
    viewport.scrollTop += second.getBoundingClientRect().top - viewport.getBoundingClientRect().top + 100;
    window.pinchEvent = (type, distance) => {
      const rect = viewport.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const touches = distance === null ? [] : [-1, 1].map((sign, identifier) => new Touch({ identifier, target: viewport, clientX: x + sign * distance / 2, clientY: y }));
      viewport.dispatchEvent(new TouchEvent(type, { touches, bubbles: true, cancelable: true }));
    };
  });
  const pinch = async (from, to) => {
    await page.evaluate(from => window.pinchEvent('touchstart', from), from);
    await page.evaluate(to => window.pinchEvent('touchmove', to), to);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.pinchEvent('touchend', null));
  };
  await pinch(100, 220);
  await page.waitForFunction(() => document.querySelector('[data-page-index="1"] .ps-reader-page__detail')?.complete);
  for (const distance of [145, 80, 130]) {
    const before = await page.locator('[data-page-index="1"]').evaluate(el => {
      const d = el.querySelector('.ps-reader-page__detail');
      return [parseFloat(d.style.left) / el.offsetWidth, parseFloat(d.style.top) / el.offsetHeight, parseFloat(d.style.width) / el.offsetWidth];
    });
    await page.evaluate(() => window.pinchEvent('touchstart', 100));
    assert.equal(await page.locator('[data-page-index="1"] .ps-reader-page__detail').evaluate(el => getComputedStyle(el).display), 'block');
    await page.evaluate(distance => window.pinchEvent('touchmove', distance), distance);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await page.evaluate(() => {
      window.pinchEvent('touchend', null);
      const el = document.querySelector('[data-page-index="1"]');
      const d = el.querySelector('.ps-reader-page__detail');
      return [parseFloat(d.style.left) / el.offsetWidth, parseFloat(d.style.top) / el.offsetHeight, parseFloat(d.style.width) / el.offsetWidth];
    });
    before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < 0.002, 'Sharp patch must remain at the same page coordinates after pinch'));
    assert.equal(await page.locator('.ps-reader-pages').evaluate(el => el.style.transform), '');
  }
  await page.waitForTimeout(250);
  const mime = await page.locator('.ps-reader-page__surface img').first().evaluate(async img => (await fetch(img.src)).headers.get('content-type'));
  assert.equal(mime, 'image/png');
  await mkdir('tmp/browser-qa', { recursive: true });
  await page.screenshot({ path: 'tmp/browser-qa/viewer-pinch-mobile.png' });
  console.log('PASS: repeated page-2 pinch in/out; sharp patch alignment during and after pinch; lossless base rendering.');
} finally { await browser.close(); }
