import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  await page.addInitScript(() => {
    // Diagnostic spy in this isolated test context only; no shipping hook.
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    const active = new Set();
    window.__cameraDesignUrls = { active, created: 0, revoked: 0 };
    URL.createObjectURL = (value) => {
      const url = create(value);
      active.add(url);
      window.__cameraDesignUrls.created++;
      return url;
    };
    URL.revokeObjectURL = (url) => {
      active.delete(url);
      window.__cameraDesignUrls.revoked++;
      revoke(url);
    };
  });
  await page.goto(
    "http://127.0.0.1:5173/tests/browser/fixtures/native-camera-design.html",
  );
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Camera design preview—not native camera",
        exact: true,
      })
      .count(),
    1,
    "explicit DEV simulation, not native camera",
  );
  const screen = page.locator("[data-camera-design-screen]");
  assert.equal(
    await screen
      .getByRole("heading", { name: "Document camera", exact: true })
      .count(),
    1,
  );
  assert(
    !/Gallery|Light off|Light on|Take photo|Find all four edges|Tap to focus/.test(
      await screen.innerText(),
    ),
  );
  const light = screen.getByRole("button", { name: "Turn simulated light on" });
  assert.equal(await light.getAttribute("aria-pressed"), "false");
  await light.click();
  assert.equal(
    await screen
      .getByRole("button", { name: "Turn simulated light off" })
      .getAttribute("aria-pressed"),
    "true",
  );
  for (const button of await screen.getByRole("button").all()) {
    const box = await button.boundingBox();
    assert(box.width >= 48 && box.height >= 48, "48px minimum targets");
  }
  await screen.getByRole("button", { name: "Simulate capture" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Simulated capture complete" })
    .waitFor();
  await screen.getByRole("button", { name: "Reset camera preview" }).click();
  assert.equal(
    await screen
      .getByRole("button", { name: "Turn simulated light on" })
      .getAttribute("aria-pressed"),
    "false",
  );
  const png = Buffer.from(
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(32, 48);
      canvas.getContext("2d").fillRect(0, 0, 32, 48);
      return [
        ...new Uint8Array(
          await (
            await canvas.convertToBlob({ type: "image/png" })
          ).arrayBuffer(),
        ),
      ];
    }),
  );
  const input = page.locator("input[type=file]");
  await input.setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png,
  });
  await screen.locator(".camera-design__gallery img").waitFor();
  await page.waitForFunction(() => window.__cameraDesignUrls.active.size === 1);
  const first = await screen
    .locator(".camera-design__gallery img")
    .getAttribute("src");
  await input.setInputFiles({
    name: "synthetic-replacement.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForFunction(
    (old) => document.querySelector(".camera-design__gallery img")?.src !== old,
    first,
  );
  await page.waitForFunction(() => window.__cameraDesignUrls.active.size === 1);
  assert.equal(
    await page.evaluate(
      (url) => window.__cameraDesignUrls.active.has(url),
      first,
    ),
    false,
    "previous URL revoked after image swap",
  );
  const current = await screen
    .locator(".camera-design__gallery img")
    .getAttribute("src");
  const huge = Buffer.from(png);
  huge.writeUInt32BE(50000, 16);
  huge.writeUInt32BE(50000, 20);
  const created = await page.evaluate(() => window.__cameraDesignUrls.created);
  await input.setInputFiles({
    name: "synthetic-over-limit.png",
    mimeType: "image/png",
    buffer: huge,
  });
  await page.getByRole("alert").filter({ hasText: "16 megapixels" }).waitFor();
  assert.equal(
    await screen.locator(".camera-design__gallery img").getAttribute("src"),
    current,
    "over-limit header keeps last preview",
  );
  assert.equal(
    await page.evaluate(() => window.__cameraDesignUrls.created),
    created,
    "huge header rejected before URL/decode",
  );
  await input.setInputFiles({
    name: "synthetic-over-bytes.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  });
  await page.getByRole("alert").filter({ hasText: "8 MB" }).waitFor();
  assert.equal(
    await screen.locator(".camera-design__gallery img").getAttribute("src"),
    current,
  );
  await screen.getByRole("button", { name: "Reset camera preview" }).click();
  await page.waitForFunction(() => window.__cameraDesignUrls.active.size === 0);
  assert.equal(
    await screen.locator(".camera-design__gallery img").count(),
    0,
    "reset returns fallback icon",
  );
  await page.screenshot({
    path: ".superpowers/sdd/2026-10-03-native-camera-design-preview/desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await screen.isVisible());
  assert((await screen.boundingBox()).width <= 390);
  await page.screenshot({
    path: ".superpowers/sdd/2026-10-03-native-camera-design-preview/mobile.png",
  });
  console.log(
    "CAMERA_DESIGN_PREVIEW_OK desktop/mobile accessible controls honest simulation",
  );
} finally {
  await browser.close();
}
