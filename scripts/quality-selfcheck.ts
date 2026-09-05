import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { set, get } from "idb-keyval";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import JSZip from "jszip";
import { parsePages } from "../src/pdf/pageSelection";
import { projectiveMap, validCorners } from "../src/pdf/scanGeometry";
import {
  listRecents,
  getRecent,
  saveRecent,
  renameRecent,
  deleteRecent,
  clearRecents,
} from "../src/store/recents";
import { packageImages } from "../src/store/files";
import { runWorkerOperation } from "../src/pdf/worker";
import { docxToPdf, validateDocxArchive } from "../src/pdf/docxToPdf";
import {
  buildDocx,
  documentXml,
  paragraphXml,
  pickedDocx,
} from "../src/pdf/docxToPdf.test";

assert.deepEqual(parsePages("3, 1-2, 2", 5), [2, 0, 1]);
for (const invalid of ["0", "4-2", "1,,2", "8", "1.5", "-1"])
  assert.throws(() => parsePages(invalid, 5));
const corners = [
  { x: 0.1, y: 0.2 },
  { x: 0.9, y: 0.1 },
  { x: 0.8, y: 0.9 },
  { x: 0.2, y: 0.8 },
];
assert(validCorners(corners));
assert(!validCorners([corners[0]!, corners[2]!, corners[1]!, corners[3]!]));
const map = projectiveMap(corners);
for (const [i, [u, v]] of [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
].entries()) {
  const p = map(u!, v!);
  assert(Math.abs(p.x - corners[i]!.x) < 1e-8);
  assert(Math.abs(p.y - corners[i]!.y) < 1e-8);
}
await set("pdf.recents", [
  {
    id: "legacy",
    name: "old.pdf",
    tool: "merge",
    mime: "application/pdf",
    bytes: new Uint8Array([1, 2, 3]),
    size: 3,
    createdAt: 1,
  },
]);
assert.equal((await listRecents())[0]!.bytes.length, 0);
assert.deepEqual((await getRecent("legacy"))!.bytes, new Uint8Array([1, 2, 3]));
const large = await saveRecent({
  name: "large.pdf",
  tool: "merge",
  bytes: new Uint8Array(9 * 1024 * 1024).fill(7),
});
assert.equal((await getRecent(large.id))!.bytes.length, 9 * 1024 * 1024);
assert(
  (await listRecents()).every((row) => row.bytes.length === 0 && row.stored),
);
await Promise.all(
  Array.from({ length: 8 }, (_, i) =>
    saveRecent({
      name: `file-${i}.pdf`,
      tool: "merge",
      bytes: new Uint8Array([i]),
    }),
  ),
);
assert.equal((await listRecents()).length, 10);
await renameRecent(large.id, "renamed.pdf");
assert.equal((await getRecent(large.id))!.name, "renamed.pdf");
await deleteRecent(large.id);
assert.equal(await getRecent(large.id), undefined);
assert.equal(await get(`pdf.file.${large.id}`), undefined);
await clearRecents();
assert.equal((await listRecents()).length, 0);
const archive = await packageImages(
  Array.from(
    { length: 41 },
    () => new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
  ),
  "test-pages",
);
assert.equal(archive.mime, "application/zip");
assert.equal(
  Object.keys((await JSZip.loadAsync(archive.bytes)).files).length,
  41,
);
await assert.rejects(
  packageImages(
    Array.from({ length: 201 }, () => new Blob(["x"], { type: "image/jpeg" })),
    "too-many",
  ),
  /200/,
);
const source = await PDFDocument.create();
const font = await source.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 4; i++)
  source
    .addPage([300, 400])
    .drawText(`Original page ${i}`, { x: 30, y: 340, size: 14, font });
const field = source.getForm().createTextField("customer");
field.setText("Preserved form");
field.addToPage(source.getPage(0), { x: 30, y: 200, width: 150, height: 24 });
const sourceBytes = await source.save();
const input = {
  name: "source.pdf",
  mime: "application/pdf",
  bytes: sourceBytes.slice().buffer as ArrayBuffer,
};
const split = await runWorkerOperation({
  id: 1,
  op: "split",
  file: input,
  range: { start: 1, end: 4, pages: [3, 0] },
});
const splitTask = pdfjs.getDocument({
  data: new Uint8Array(split.bytes!).slice(),
});
const splitPdf = await splitTask.promise;
assert.equal(splitPdf.numPages, 2);
const text = await splitPdf.getPage(1).then((p) => p.getTextContent());
assert(
  text.items.some(
    (item) => "str" in item && item.str.includes("Original page 4"),
  ),
);
await splitTask.destroy();
const optimized = await runWorkerOperation({
  id: 2,
  op: "optimize",
  file: input,
});
const optimizedPdf = await PDFDocument.load(optimized.bytes!);
assert.equal(
  optimizedPdf.getForm().getTextField("customer").getText(),
  "Preserved form",
);
const signed = await PDFDocument.load(sourceBytes);
const signature = signed.context.obj({
  FT: "Sig",
  T: signed.context.obj("Signature"),
});
// A signature field in the AcroForm must force a byte-identical original, preserving signed bytes.
const signatureRef = signed.context.register(signature);
signed.getForm().acroForm.Fields()!.push(signatureRef);
const signedBytes = await signed.save();
const safe = await runWorkerOperation({
  id: 3,
  op: "optimize",
  file: { ...input, bytes: signedBytes.slice().buffer },
});
assert.deepEqual(new Uint8Array(safe.bytes!), signedBytes);
const numbered = await runWorkerOperation({
  id: 4,
  op: "pageNumbers",
  file: input,
  options: { start: 7, position: "right", total: false },
});
assert.equal(numbered.pageCount, 4);
const numberedTask = pdfjs.getDocument({
  data: new Uint8Array(numbered.bytes!).slice(),
});
const numberedPdf = await numberedTask.promise;
const numberText = await numberedPdf.getPage(1).then((p) => p.getTextContent());
assert(numberText.items.some((item) => "str" in item && item.str === "7"));
await numberedTask.destroy();
const marked = await runWorkerOperation({
  id: 6,
  op: "watermark",
  file: input,
  input: { text: "Привет", opacity: 0.2, angle: 0 },
});
const markedTask = pdfjs.getDocument({
  data: new Uint8Array(marked.bytes!).slice(),
});
const markedPdf = await markedTask.promise;
assert(
  (await markedPdf.getPage(1).then((p) => p.getTextContent())).items.some(
    (item) => "str" in item && item.str === "Привет",
  ),
);
await markedTask.destroy();
const tinyPng = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
const imagePdf = await runWorkerOperation({
  id: 7,
  op: "imagesToPdf",
  files: [
    {
      name: "pixel.png",
      mime: "image/png",
      bytes: tinyPng.buffer as ArrayBuffer,
    },
  ],
  options: { size: "letter", landscape: true, margin: 0 },
});
assert.deepEqual(
  (await PDFDocument.load(imagePdf.bytes!)).getPage(0).getSize(),
  { width: 792, height: 612 },
);
const protectedFile = await runWorkerOperation({
  id: 5,
  op: "protect",
  file: input,
  input: { userPassword: " spaced password " },
});
const unlockedTask = pdfjs.getDocument({
  data: new Uint8Array(protectedFile.bytes!).slice(),
  password: " spaced password ",
});
const unlocked = await unlockedTask.promise;
assert.equal(unlocked.numPages, 4);
await unlockedTask.destroy();
const unicode = await docxToPdf(
  pickedDocx(
    await buildDocx({
      documentXml: documentXml(paragraphXml("Ελληνικά Привет Łódź")),
    }),
  ),
);
assert(unicode.ok);
if (unicode.ok) {
  const task = pdfjs.getDocument({ data: unicode.bytes.slice() });
  const pdf = await task.promise;
  const content = await pdf.getPage(1).then((p) => p.getTextContent());
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
  assert(text.includes("Привет"));
  assert(text.includes("Łódź"));
  await task.destroy();
}
assert.throws(() => validateDocxArchive(new Uint8Array([1, 2, 3])));
console.log(
  "QUALITY_SELF_CHECK_OK page-selection perspective library-migration large-file-retention concurrent-writes 41-image-archive lossless-form-preservation signature-preservation password-whitespace unicode-text",
);
