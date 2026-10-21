import assert from "node:assert/strict";
import { createGalleryImporter } from "../src/store/galleryImport.ts";
let callback: (e: {
  requestId: string;
  phase: string;
  bytes: number;
  files: number;
}) => void = () => {};
let resolve!: (b: {
  files: { id: string; name: string; mime: string; size: number }[];
  error: string;
}) => void;
let id = "";
let cancel = 0;
let removed = 0;
const released: string[] = [];
const states: string[] = [];
const bridge = {
  pickImages: async (o: { requestId: string }) => {
    id = o.requestId;
    return await new Promise<{
      files: { id: string; name: string; mime: string; size: number }[];
      error: string;
    }>((r) => {
      resolve = r;
    });
  },
  cancelPickImages: async () => {
    cancel++;
  },
  release: async (o: { id: string }) => {
    released.push(o.id);
  },
  addListener: async (_: "importProgress", fn: typeof callback) => {
    callback = fn;
    return {
      remove: async () => {
        removed++;
      },
    };
  },
};
const pick = createGalleryImporter(
  bridge,
  async () => new Uint8Array([1, 2, 3]),
  () => "owned-session",
);
{
  const abort = new AbortController();
  const p = pick(2, {
    signal: abort.signal,
    onProgress: (s) => states.push(s.phase),
  });
  await new Promise((r) => setTimeout(r, 0));
  callback({ requestId: "retired", phase: "importing", bytes: 1, files: 0 });
  assert.equal(states.includes("importing"), false);
  callback({ requestId: id, phase: "importing", bytes: 1, files: 0 });
  assert.equal(states.includes("importing"), true);
  resolve({
    files: [
      { id: "file-one", name: "synthetic.jpg", mime: "image/jpeg", size: 3 },
    ],
    error: "",
  });
  const files = await p;
  assert.equal(files[0]?.size, 3);
  assert.deepEqual(released, ["file-one"]);
  assert.equal(removed, 1);
}
{
  const abort = new AbortController();
  const p = pick(2, { signal: abort.signal });
  await new Promise((r) => setTimeout(r, 0));
  abort.abort();
  await assert.rejects(p, { name: "AbortError" });
  resolve({
    files: [
      { id: "late-file", name: "synthetic.jpg", mime: "image/jpeg", size: 3 },
    ],
    error: "",
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(released.includes("late-file"));
  assert.equal(cancel, 1);
}
console.log(
  "GALLERY_IMPORT_SELFCHECK_OK progress owner late cleanup abort listener release",
);
{
  const abort = new AbortController();
  const blocked = createGalleryImporter(
    {
      pickImages: async () => ({
        files: [
          {
            id: "blocked-file",
            name: "synthetic.jpg",
            mime: "image/jpeg",
            size: 3,
          },
        ],
        error: "",
      }),
      cancelPickImages: async () => {},
      release: async () => await new Promise(() => {}),
      addListener: async () => ({
        remove: async () => await new Promise(() => {}),
      }),
    },
    async () => await new Promise(() => {}),
    () => "blocked-session",
  );
  const p = blocked(1, { signal: abort.signal });
  await new Promise((r) => setTimeout(r, 0));
  abort.abort();
  const outcome = await Promise.race([
    p.then(
      () => false,
      (e) => e.name === "AbortError",
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), 100)),
  ]);
  assert.equal(
    outcome,
    true,
    "abort settles JS even when chunk/cleanup bridge promises never resolve",
  );
}
