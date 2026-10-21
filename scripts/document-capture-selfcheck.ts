import assert from "node:assert/strict";
import { createDocumentCapture } from "../src/store/documentCamera.ts";
let calls = 0,
  cancels = 0,
  resolve!: (v: {
    gallery?: boolean;
    cancelled?: boolean;
    id: string;
    name: string;
    mime: string;
    size: number;
  }) => void;
const bridge = {
  capture: async () => {
    calls++;
    return await new Promise<never>((r) => {
      resolve = r;
    });
  },
  cancelCapture: async () => {
    cancels++;
  },
};
const capture = createDocumentCapture(
  bridge,
  async () => ({
    name: "synthetic.jpg",
    mime: "image/jpeg",
    bytes: new Uint8Array([1]),
  }),
  () => "owned-camera",
);
const first = new AbortController(),
  second = new AbortController();
const p1 = capture({ signal: first.signal });
first.abort();
const p2 = capture({ signal: second.signal });
await assert.rejects(p1, { name: "AbortError" });
await new Promise((r) => setTimeout(r, 0));
assert.equal(calls, 1, "StrictMode shares underlying capture");
assert.equal(cancels, 0);
resolve({ gallery: true, id: "", name: "", mime: "", size: 0 });
assert.equal(await p2, "gallery");
const last = new AbortController();
const p3 = capture({ signal: last.signal });
last.abort();
await assert.rejects(p3, { name: "AbortError" });
await new Promise((r) => setTimeout(r, 0));
assert.equal(cancels, 1);
resolve({ cancelled: true, id: "", name: "", mime: "", size: 0 });
await new Promise((r) => setTimeout(r, 0));
const p4 = capture();
resolve({ cancelled: true, id: "", name: "", mime: "", size: 0 });
assert.equal(await p4, null);
assert.equal(calls, 3, "reentry starts fresh capture");
{
  const abort = new AbortController();
  const old = capture({ signal: abort.signal });
  abort.abort();
  await assert.rejects(old, { name: "AbortError" });
  await new Promise((r) => setTimeout(r, 0));
  const retry = capture();
  const oldResolve = resolve;
  oldResolve({ gallery: true, id: "", name: "", mime: "", size: 0 });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    calls,
    5,
    "real remount waits old cancellation then starts NEW underlying capture",
  );
  resolve({ cancelled: true, id: "", name: "", mime: "", size: 0 });
  assert.equal(await retry, null);
}
console.log(
  "DOCUMENT_CAPTURE_SELFCHECK_OK strict replay abort lease cancel reentry",
);
