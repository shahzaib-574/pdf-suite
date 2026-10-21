import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const originUrl = process.env.PRESENTATION_ORIGIN ?? "http://127.0.0.1:5173";
  await page.goto(
    `${originUrl}/tests/browser/fixtures/native-camera-presentation.html`,
  );
  const fixture = await page.evaluateHandle(
    () => import("/tests/browser/fixtures/native-camera-presentation.tsx"),
  );
  const call = (method, ...args) =>
    fixture.evaluate((m, { method, args }) => m[method](...args), {
      method,
      args,
    });
  await call("mount", "#/settings");
  await page
    .getByRole("heading", {
      name: "Settings",
      exact: true,
      includeHidden: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Scan to PDF", exact: true }).click();
  assert(
    await page
      .getByRole("heading", {
        name: "Settings",
        exact: true,
        includeHidden: true,
      })
      .isVisible(),
    "origin Settings remains visible during native launch, not a blank/Back-only screen",
  );
  await page.waitForFunction((m) => m.trace().captureCalls === 1, fixture);
  assert.equal(
    await page
      .getByRole("button", { name: "Back to scan", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Cancel camera", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .isVisible(),
    true,
  );
  await call("photoReturned");
  await page.waitForFunction((m) => m.trace().readCalls === 1, fixture);
  assert(
    await page
      .getByRole("heading", {
        name: "Settings",
        exact: true,
        includeHidden: true,
      })
      .isVisible(),
    "origin visible after Activity result while chunk read held",
  );
  await call("finishRead");
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Settings",
        exact: true,
        includeHidden: true,
      })
      .count(),
    0,
  );
  assert.equal(
    (await call("trace")).captureCalls,
    1,
    "StrictMode exactly one native capture",
  );
  const saved = await call("draftMetadata");
  await page.getByRole("button", { name: "Return to camera" }).click();
  await page.waitForFunction((m) => m.trace().captureCalls === 2, fixture);
  assert(
    await page
      .getByRole("heading", {
        name: "Crop and Edit",
        exact: true,
        includeHidden: true,
      })
      .isVisible(),
    "existing editor remains visible for add camera",
  );
  await call("photoReturned");
  await page.waitForFunction((m) => m.trace().readCalls === 2, fixture);
  assert(
    await page
      .getByRole("heading", {
        name: "Crop and Edit",
        exact: true,
        includeHidden: true,
      })
      .isVisible(),
    "editor stays visible during held returned-photo read",
  );
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .click();
  await call("finishRead");
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  assert.deepEqual(
    await call("draftMetadata"),
    saved,
    "cancel add preserves pages and edits",
  );
  const box = await page.locator(".scan-edit__slide img").first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page.waitForFunction((m) => m.trace().captureCalls === 3, fixture);
  assert(
    await page
      .getByRole("heading", {
        name: "Crop and Edit",
        exact: true,
        includeHidden: true,
      })
      .isVisible(),
    "retake retains editor",
  );
  await call("back");
  await call("photoReturned");
  await call("finishRead");
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  assert.deepEqual(
    await call("draftMetadata"),
    saved,
    "late retake photo after Back cannot replace old page",
  );
  await call("unmount");
  await call("mount", "#/");
  await page.getByRole("button", { name: "Scan to PDF", exact: true }).click();
  await page
    .getByRole("heading", { name: "Crop and Edit", exact: true })
    .waitFor();
  assert.equal(
    (await call("trace")).captureCalls,
    3,
    "existing draft restores without camera",
  );
  await call("unmount");
  await call("clearDraft");
  // All bottom-nav origins retain their own visible page and route title.
  for (const [origin, heading, title] of [
    ["#/", "Your next document, ready.", "Tools"],
    ["#/settings", "Settings", "Settings"],
    ["#/recents", "Recent files", "Recent files"],
  ]) {
    const before = (await call("trace")).captureCalls;
    await call("mount", origin);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    const scroll = await page.evaluate(async () => {
      await Promise.all(
        document
          .querySelector(".route-stage")
          .getAnimations()
          .map((a) => a.finished),
      );
      window.scrollTo(0, 400);
      return window.scrollY;
    });
    if (origin === "#/") {
      assert(scroll > 100, "Home supplies a genuine scrollable origin");
      if (process.env.EXPECT_BANNER_PREVIEW === "true")
        assert.equal(
          await page.locator("[data-tools-banner-preview]").count(),
          1,
          "actual Home initially eligible for DEV-only neutral placeholder",
        );
    }
    await page
      .getByRole("button", { name: "Scan to PDF", exact: true })
      .click();
    await page.waitForFunction(({ m, n }) => m.trace().captureCalls === n, {
      m: fixture,
      n: before + 1,
    });
    assert(
      await page
        .getByRole("heading", {
          name: heading,
          exact: true,
          includeHidden: true,
        })
        .isVisible(),
    );
    assert((await call("trace")).title.startsWith(title));
    if (origin === "#/" && process.env.EXPECT_BANNER_PREVIEW === "true")
      assert.equal(
        await page.locator("[data-tools-banner-preview]").count(),
        0,
        "retained Home receives bannerEligible=false while capture pending",
      );
    console.log(
      "SCROLL_PENDING",
      origin,
      scroll,
      await page.evaluate(() => window.scrollY),
    );
    await call("cancelled");
    await page.waitForURL((url) => url.hash === origin);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    console.log(
      "SCROLL_RESTORED",
      origin,
      scroll,
      await page.evaluate(() => window.scrollY),
    );
    await page.waitForFunction(
      (expected) => window.scrollY === expected,
      scroll,
      { timeout: 3000 },
    );
    assert.equal(
      await page.evaluate(() => window.scrollY),
      scroll,
      "cancel restores origin scroll",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Scan to PDF", exact: true })
        .evaluate((x) => document.activeElement === x),
      true,
      "cancel restores origin nav focus",
    );
    await call("unmount");
  }
  await call("mount", "#/");
  await page.getByPlaceholder("Search tools").fill("merge");
  const calls = (await call("trace")).captureCalls;
  await page.getByRole("button", { name: "Scan to PDF", exact: true }).click();
  await page.waitForFunction(({ m, n }) => m.trace().captureCalls === n, {
    m: fixture,
    n: calls + 1,
  });
  assert(await page.getByPlaceholder("Search tools").isVisible());
  await call("failed");
  await page
    .getByRole("alert")
    .filter({ hasText: "Camera permission denied" })
    .waitFor();
  await page.getByRole("button", { name: "Try camera again" }).click();
  await page.waitForFunction(({ m, n }) => m.trace().captureCalls === n, {
    m: fixture,
    n: calls + 2,
  });
  assert(
    await page.getByPlaceholder("Search tools").isVisible(),
    "retry shows origin again",
  );
  await call("gallery");
  await page.getByRole("status").filter({ hasText: "Choose photos" }).waitFor();
  await page.getByRole("button", { name: "Back to scan", exact: true }).click();
  await call("galleryCancel");
  await page.waitForURL((url) => url.hash === "#/");
  assert.equal(
    await page.getByPlaceholder("Search tools").inputValue(),
    "merge",
    "retained Home instance preserves filter/query",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Scan to PDF", exact: true })
      .evaluate((x) => document.activeElement === x),
    true,
    "gallery cancel restores equivalent nav focus after original nav unmount",
  );
  await call("unmount");
  // A delayed restore may be canceled without launching; late completion cannot reclaim route.
  const beforeDraft = (await call("trace")).captureCalls;
  await call("mount", "#/settings", true);
  await page.getByRole("button", { name: "Scan to PDF", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel scan", exact: true })
    .waitFor();
  assert.equal((await call("trace")).captureCalls, beforeDraft);
  await call("back");
  await page.waitForURL((url) => url.hash === "#/settings");
  await call("finishDraft");
  assert.equal((await call("trace")).captureCalls, beforeDraft);
  await call("unmount");
  // A suspended origin runner must not publish/navigate after capture has started.
  await call("prepareJob");
  await call("mount", "#/tool/merge");
  await page.getByRole("button", { name: "Merge PDFs", exact: true }).click();
  await call("scan");
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .waitFor();
  await call("releaseJob");
  assert.equal(
    (await call("trace")).hash,
    "#/tool/scan",
    "old job cannot navigate over capture",
  );
  await call("cancelled");
  await page.waitForURL((url) => url.hash === "#/tool/merge");
  assert.equal(
    await page
      .getByRole("button", { name: "Merge PDFs", exact: true })
      .isEnabled(),
    true,
    "settled aborted origin ready to retry after cancel, not permanently busy",
  );
  await call("scan");
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .waitFor();
  await call("route", "#/settings");
  await call("photoReturned");
  await call("finishRead");
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  assert.equal(
    (await call("trace")).hash,
    "#/settings",
    "late photo cannot reclaim a newer route",
  );
  await call("unmount");
  await call("prepareViewer");
  await call("mount", "#/viewer");
  await page.locator(".ps-reader").waitFor();
  await call("scan");
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Cancel camera", exact: true })
      .evaluate((x) => x === document.activeElement),
    true,
    "pending cancellation receives focus outside inert/hidden pages",
  );
  await page.keyboard.press("Control+f");
  await call("back");
  await call("cancelled");
  await page.waitForURL((url) => url.hash === "#/viewer");
  assert.equal(
    await page.locator(".ps-reader-search").count(),
    0,
    "retained Viewer keyboard listener cannot react during capture",
  );
  await call("unmount");
  await call("clearDraft");
  await call("mount", "#/tool/scan");
  await page
    .getByRole("button", { name: "Cancel camera", exact: true })
    .waitFor();
  await call("cancelled");
  await page.waitForURL((url) => url.hash === "#/");
  assert.equal(
    (await call("trace")).depth,
    0,
    "direct scan cancel replaces fallback instead of leaving a phantom camera history entry",
  );
  await call("unmount");
  await call("mount", "#/", false, false);
  await page.getByRole("button", { name: "Scan to PDF", exact: true }).click();
  await page.locator(".scan-cam").waitFor();
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  console.log(
    "NATIVE_CAMERA_PRESENTATION_OK actual App/ToolFlow origin/read/add/retake/draft/cancel/error/gallery/StrictMode/late/job/browser",
  );
} finally {
  await browser.close();
}
