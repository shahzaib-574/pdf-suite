import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:5173/tests/browser/fixtures/native-camera-flow.html",
  );
  const fixture = await page.evaluateHandle(
    () => import("/tests/browser/fixtures/native-camera-flow.tsx"),
  );
  const call = (method, ...args) =>
    fixture.evaluate((m, { method, args }) => m[method](...args), {
      method,
      args,
    });
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 1, fixture);
  await page.waitForFunction((m) => m.trace().frames.length > 0, fixture);
  const launch = await call("trace");
  assert.equal(
    launch.commits[0].captureCalls,
    1,
    "capture requested in committed layout before first paint",
  );
  assert.equal(
    launch.commits[0].headings,
    0,
    "no camera-launch heading committed",
  );
  assert.equal(
    launch.commits[0].statuses,
    0,
    "no camera-launch status committed",
  );
  assert.equal(
    launch.frames[0].captureCalls,
    1,
    "StrictMode shares one capture before first frame",
  );
  assert(
    !launch.frames[0].text.includes("Opening the native camera"),
    "no opening caption painted",
  );
  assert(
    !launch.frames[0].text.includes("Document camera"),
    "no web launch heading painted",
  );
  assert.equal(
    await page.getByRole("button", { name: "Cancel camera" }).isEnabled(),
    true,
    "pending launch remains cancellable",
  );
  await call("gallery");
  await page.getByRole("status").filter({ hasText: "Choose photos" }).waitFor();
  assert.equal(
    (await call("trace")).captureCalls,
    1,
    "StrictMode one physical request",
  );
  await call("importing");
  await page
    .getByRole("status")
    .filter({ hasText: "Importing selected photos" })
    .waitFor();
  await call("reading");
  await page
    .getByRole("status")
    .filter({ hasText: "Reading selected photos" })
    .waitFor();
  await call("selected");
  await page
    .getByRole("status")
    .filter({ hasText: "Preparing scan photos" })
    .waitFor();
  await call("normalized");
  await page.waitForFunction((m) => m.trace().received === 1, fixture);
  await call("unmount");
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 2, fixture);
  await call("gallery");
  await page.getByRole("status").filter({ hasText: "Choose photos" }).waitFor();
  await page.getByRole("button", { name: "Back to scan" }).click();
  assert.equal((await call("trace")).galleryAborted, true);
  await call("selected");
  assert.equal(
    (await call("trace")).received,
    1,
    "late gallery cannot append after Back",
  );
  await call("unmount");
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 3, fixture);
  await call("cancelled");
  await page.waitForFunction((m) => m.trace().closed === 2, fixture);
  await call("unmount");
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 4, fixture);
  await page.getByRole("button", { name: "Cancel camera" }).click();
  await page.waitForFunction((m) => m.trace().cancelCalls >= 1, fixture);
  await call("photo");
  assert.equal(
    (await call("trace")).readCalls,
    1,
    "obsolete photo enters the reader so its finally cleanup can release it",
  );
  assert.equal(
    (await call("trace")).abortedReadCalls,
    1,
    "obsolete photo reader receives an aborted signal",
  );
  assert.equal(
    (await call("trace")).received,
    1,
    "late camera result after pending Back cannot publish",
  );
  assert.equal(
    (await call("trace")).closed,
    3,
    "late cancel cannot close twice",
  );
  await call("unmount");
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 5, fixture);
  await call("failed");
  await page
    .getByRole("alert")
    .filter({ hasText: "Camera permission denied" })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Document camera" }).count(),
    1,
    "error heading/recovery remain visible",
  );
  assert(
    await page.getByRole("button", { name: "Choose from gallery" }).isEnabled(),
  );
  await page.getByRole("button", { name: "Try camera again" }).click();
  await page.waitForFunction((m) => m.trace().captureCalls === 6, fixture);
  assert.equal(
    await page.getByRole("heading", { name: "Document camera" }).count(),
    0,
    "retry hides launch UI too",
  );
  await call("gallery");
  await page.getByRole("status").filter({ hasText: "Choose photos" }).waitFor();
  await call("selected");
  await page
    .getByRole("status")
    .filter({ hasText: "Preparing scan photos" })
    .waitFor();
  await call("normalized");
  await page.waitForFunction((m) => m.trace().received === 2, fixture);
  await call("unmount");
  await call("mount");
  await page.waitForFunction((m) => m.trace().captureCalls === 7, fixture);
  await call("failed");
  await page.getByRole("button", { name: "Choose from gallery" }).click();
  await page.getByRole("status").filter({ hasText: "Choose photos" }).waitFor();
  assert.equal(
    (await call("trace")).captureCalls,
    7,
    "gallery recovery does not reopen native camera",
  );
  await page.getByRole("button", { name: "Back to scan" }).click();
  await call("selected");
  assert.equal(
    (await call("trace")).received,
    2,
    "recovery Back suppresses late selection",
  );
  await call("unmount");
  assert.deepEqual(errors, []);
  console.log(
    "NATIVE_CAMERA_FLOW_BROWSER_OK realReact beforePaint quietLaunch StrictMode galleryPhases Back stale error retry recovery",
  );
} finally {
  await browser.close();
}
