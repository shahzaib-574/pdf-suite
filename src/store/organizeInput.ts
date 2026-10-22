import { PDFDocument, EncryptedPDFError } from "pdf-lib";
import type { PickedFile } from "../lib/types";
import { fileListToPicked, ensureJpegOrPng, MAX_INPUT_BYTES } from "./files";
import { engine } from "../pdf";
import { unprotectPdf } from "../pdf/protectPdf";
export type OrganizePassword = (incorrect: boolean) => Promise<string>;
export async function readableOrganizePdf(
  file: PickedFile,
  signal: AbortSignal,
  ask: OrganizePassword,
): Promise<PickedFile> {
  signal.throwIfAborted();
  try {
    const doc = await PDFDocument.load(file.bytes);
    signal.throwIfAborted();
    if (!doc.getPageCount()) throw Error("This PDF has no pages to organize.");
    return { ...file, password: undefined };
  } catch (error) {
    // Optimized browser bundles can throw a different copy of pdf-lib's error class.
    if (
      !(error instanceof EncryptedPDFError) &&
      !(
        error instanceof Error &&
        error.message.startsWith(
          "Input document to `PDFDocument.load` is encrypted.",
        )
      )
    )
      throw error;
  }
  let incorrect = false;
  let supplied = file.password;
  for (;;) {
    const password = supplied ?? (await ask(incorrect));
    supplied = undefined;
    signal.throwIfAborted();
    try {
      const bytes = await unprotectPdf(file.bytes, password);
      signal.throwIfAborted();
      if (bytes.length > MAX_INPUT_BYTES)
        throw Error("Unlocked PDF exceeds 128 MB.");
      return { ...file, bytes, password: undefined };
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof Error &&
        (error.message === "That password was incorrect." ||
          error.message === "Wrong password for this PDF.")
      )
        incorrect = true;
      else throw error;
    }
  }
}
export async function prepareOrganizeInput(
  files: File[],
  signal: AbortSignal,
  ask: OrganizePassword,
): Promise<PickedFile> {
  if (!files.length) throw Error("Choose one PDF or a group of images.");
  if (
    files.length > 200 ||
    files.reduce((n, f) => n + f.size, 0) > MAX_INPUT_BYTES
  )
    throw Error("Choose up to 200 images totaling no more than 128 MB.");
  const pdf = files.filter(
    (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
  );
  signal.throwIfAborted();
  if (pdf.length) {
    if (files.length !== 1)
      throw Error(
        "Choose one PDF OR a group of images, not mixed files or multiple PDFs.",
      );
    const [file] = await fileListToPicked(files);
    return readableOrganizePdf(file!, signal, ask);
  }
  const images: PickedFile[] = [];
  let preparedBytes = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const [raw] = await fileListToPicked([file]); // Existing MIME/filename fallback contract.
    signal.throwIfAborted();
    if (!raw?.mime.startsWith("image/"))
      throw Error("Choose one PDF or supported images.");
    const image = await ensureJpegOrPng(raw);
    signal.throwIfAborted();
    preparedBytes += image.bytes.length;
    if (preparedBytes > MAX_INPUT_BYTES)
      throw Error("Prepared images exceed 128 MB.");
    images.push(image);
  }
  const result = await engine.imagesToPdf(images, {
    size: "original",
    landscape: false,
    margin: 0,
  });
  signal.throwIfAborted();
  if (!result.ok) throw Error(result.message);
  if (result.bytes.length > MAX_INPUT_BYTES)
    throw Error("Prepared image PDF exceeds 128 MB. Choose fewer images.");
  return {
    name: `${images.length} images.pdf`,
    mime: "application/pdf",
    bytes: result.bytes,
  };
}
