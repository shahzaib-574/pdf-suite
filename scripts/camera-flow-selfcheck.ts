import assert from "node:assert/strict";
import { createCameraFlow } from "../src/store/cameraFlow.ts";
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const raw = {
  name: "synthetic.jpg",
  mime: "image/jpeg",
  bytes: new Uint8Array([1]),
};
const file = new File([new Uint8Array([1])], "synthetic.jpg", {
  type: "image/jpeg",
});
let pages: (typeof raw)[] = [];
let states: string[] = [];
let closes = 0;
let receives = 0;
const make = (
  capture: () => Promise<typeof raw | "gallery" | null>,
  gallery: (
    _max: number,
    signal: AbortSignal,
    p: (s: { phase: "importing"; bytes: number; files: number }) => void,
  ) => Promise<File[] | null>,
) =>
  createCameraFlow({
    capture,
    gallery,
    normalize: async () => [raw],
    context: () => ({ pages, maxPages: 2 }),
    receive: (p) => {
      pages = p;
      receives++;
    },
    close: () => {
      closes++;
    },
    state: (s) => states.push(s.phase),
  });
{
  const g = deferred<File[]>();
  const c = make(
    async () => "gallery",
    async (_, signal, progress) => {
      assert.equal(signal.aborted, false);
      progress({ phase: "importing", bytes: 10, files: 0 });
      return g.promise;
    },
  );
  const pending = c.start();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(states.includes("selecting"));
  assert.ok(states.includes("importing"));
  g.resolve([file]);
  await pending;
  assert.equal(receives, 1);
  assert.ok(states.includes("normalizing"));
  c.dispose();
}
{
  pages = [];
  const camera = deferred<typeof raw | "gallery" | null>();
  const c = make(
    () => camera.promise,
    async () => [],
  );
  const pending = c.start();
  c.dispose();
  camera.resolve(raw);
  await pending;
  assert.equal(receives, 1, "late camera cannot append after Back/unmount");
}
{
  const c = make(
    async () => null,
    async () => [],
  );
  await c.start();
  assert.equal(closes, 1);
  c.dispose();
}
{
  const c = make(
    async () => {
      throw new Error("failure");
    },
    async () => [],
  );
  await c.start();
  assert.equal(states.at(-1), "error");
  c.dispose();
}
{
  const g = deferred<File[]>();
  let signal: AbortSignal | undefined;
  const c = make(
    async () => "gallery",
    async (_, s) => {
      signal = s;
      return g.promise;
    },
  );
  const pending = c.start();
  await new Promise((r) => setTimeout(r, 0));
  c.dispose();
  assert.equal(signal?.aborted, true);
  g.resolve([file]);
  await pending;
  assert.equal(receives, 1, "late gallery cannot append");
}
console.log(
  "CAMERA_FLOW_SELFCHECK_OK phases success cancel error late Back reentry",
);
