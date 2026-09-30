import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Incorrect website-vs-app policy links and missing draft pages are
// user-visible regressions. This deliberately exercises rendered pages, not source text.
const base = process.env.REAM_TEST_URL || 'http://localhost:5174';
const nativeBase = process.env.REAM_NATIVE_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir('tmp/website-policy-review', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('.web-tool').last().waitFor();
  const policies = [
    ['./website-privacy.html', 'Website privacy policy'],
    ['./website-cookies.html', 'Cookies & local storage'],
    ['./website-terms.html', 'Terms & acceptable use'],
  ];
  for (const [href, title] of policies) {
    assert.equal(await page.locator(`footer a[href="${href}"]`).count(), 1, `Footer must expose ${title}`);
    const response = await page.request.get(new URL(href, base + '/').href);
    assert.equal(response.status(), 200);
    await page.goto(new URL(href, base + '/').href);
    await page.emulateMedia({ colorScheme: 'light' });
    assert.equal(await page.getByRole('heading', { level: 1, name: title }).count(), 1);
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow', 'Drafts must not be indexed');
    assert.equal(await page.locator('.legal-draft').count(), 1);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${title} overflows at ${width}`);
      if (width === 390 || width === 1440 || (width === 768 && href.includes('terms'))) {
        await page.screenshot({ path: `tmp/website-policy-review/${href.slice(2,-5)}-${width}-light.png`, fullPage: true });
      }
      if (width === 390 && href.includes('privacy')) {
        await page.screenshot({ path: 'tmp/website-policy-review/website-privacy-390-viewport-light.png' });
      }
    }
    const lightBackground = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.notEqual(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), lightBackground, 'Policy page supports system dark theme');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${title} dark mobile overflow`);
    await page.screenshot({ path: `tmp/website-policy-review/${href.slice(2,-5)}-390-dark.png`, fullPage: true });
    await page.goto(base);
    await page.locator('.web-tool').last().waitFor();
  }
  await page.goto(base + '/#/settings');
  for (const [href] of policies) assert.equal(await page.locator(`.ps-settings a[href="${href}"]`).count(), 1, 'Website Settings uses website policies');
  await page.getByRole('button', { name: 'Clear recent files', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Clear files', exact: true }).count(), 1, 'The documented second-step confirmation exists');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto(nativeBase + '/#/settings');
  assert.equal(await page.locator('.ps-settings a[href="./privacy.html"]').count(), 1, 'Native policy link is preserved');
  assert.equal(await page.locator('.ps-settings a[href^="./website-"]').count(), 0);
  await page.goto(nativeBase);
  assert.equal(await page.locator('img[src*="tool-icons/"]').count(), 0, 'Native glyphs are unchanged');
  assert.deepEqual(errors, []);
  console.log('PASS three website review-draft pages, footer/Settings links, four viewport widths; native policy and icons unchanged.');
} finally { await browser.close(); }
