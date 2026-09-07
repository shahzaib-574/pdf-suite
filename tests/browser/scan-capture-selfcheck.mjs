import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.addInitScript(({ fallback }) => {
      if (fallback) window.OffscreenCanvas = undefined;
      window.decodeCount = 0;
      const decode = window.createImageBitmap;
      window.createImageBitmap = (...args) => { window.decodeCount++; return decode(...args); };
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2560; canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        const draw = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2560, 1920); ctx.fillStyle = '#222'; ctx.font = '80px sans-serif'; ctx.fillText('Scan capture test', 100, 200); };
        draw();
        const stream = canvas.captureStream(10);
        const timer = setInterval(draw, 100);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        return stream;
      };
    }, { fallback });
    await page.goto('http://127.0.0.1:5173/#/tool/scan');
    await page.waitForFunction(() => document.querySelector('.scan-cam__shutter')?.disabled === false);
    const start = await page.evaluate(() => {
      const start = performance.now();
      const shutter = document.querySelector('.scan-cam__shutter');
      shutter.click(); shutter.click();
      return start;
    });
    await page.waitForFunction(() => {
      const image = document.querySelector('.scan-edit__slide img');
      return image?.complete && image.naturalWidth > 0;
    });
    const result = await page.evaluate(start => ({
      ms: Math.round(performance.now() - start),
      decodes: window.decodeCount,
      images: document.querySelectorAll('.scan-edit__slide img').length,
      width: document.querySelector('.scan-edit__slide img').naturalWidth,
      height: document.querySelector('.scan-edit__slide img').naturalHeight,
    }), start);
    assert.equal(result.decodes, 0, 'Captured JPEG must bypass gallery decoding');
    assert.equal(result.images, 1, 'Repeated shutter presses must capture only once');
    assert.deepEqual([result.width, result.height], [2560, 1920]);
    await page.getByRole('button', { name: 'Corner 1: use arrow keys to adjust', exact: true }).press('ArrowRight');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('textbox', { name: 'PDF name' }).waitFor();
    console.log(`${fallback ? 'Canvas fallback' : 'Offscreen canvas'}: ${JSON.stringify(result)}; crop and Next passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
