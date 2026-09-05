import { PAPER_SIZES } from "../lib/paperSizes";
import {
  PDFDocument,
  PDFSignature,
  StandardFonts,
  degrees,
  rgb,
  toDegrees,
} from "pdf-lib";
import type {
  OrganizeOp,
  PageRange,
  ProtectInput,
  WatermarkInput,
  ImagePdfOptions,
  PageNumberOptions,
} from "../lib/types";
import type {
  TransferFile,
  WorkerRequest,
  WorkerResponse,
  WorkerSuccess,
} from "./protocol";
import { protectPdf } from "./protectPdf";
import { documentFonts, supportsText } from "./fonts";
import { clamp, copyBuffer, humanError } from "./util";

const IMAGE_MARGIN = 24;
const WATERMARK_ANGLE = -35;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRequest(value: unknown): value is WorkerRequest {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.op === "string"
  );
}

function bytesOf(file: TransferFile): Uint8Array {
  return new Uint8Array(file.bytes);
}

async function loadPdf(file: TransferFile): Promise<PDFDocument> {
  return PDFDocument.load(bytesOf(file));
}

async function saved(
  pdf: PDFDocument,
  filename: string,
): Promise<Pick<WorkerSuccess, "bytes" | "filename" | "pageCount">> {
  const written = await pdf.save();
  const copy = new Uint8Array(written.byteLength);
  copy.set(written);
  return {
    bytes: copy.buffer as ArrayBuffer,
    filename,
    pageCount: pdf.getPageCount(),
  };
}

function hasJpegMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function hasPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function hasWebpMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

type ImageKind = "jpg" | "png" | "webp" | "other";
type EmbedKind = "jpg" | "png";

function imageKind(bytes: Uint8Array, name: string, mime: string): ImageKind {
  if (hasJpegMagic(bytes)) return "jpg";
  if (hasPngMagic(bytes)) return "png";
  if (hasWebpMagic(bytes)) return "webp";
  const lowerMime = mime.toLowerCase();
  const lowerName = name.toLowerCase();
  if (
    lowerMime === "image/jpeg" ||
    lowerMime === "image/jpg" ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg")
  ) {
    return "jpg";
  }
  if (lowerMime === "image/png" || lowerName.endsWith(".png")) return "png";
  if (lowerMime === "image/webp" || lowerName.endsWith(".webp")) return "webp";
  return "other";
}

function canRasterizeWebp(): boolean {
  return (
    typeof Blob === "function" &&
    typeof createImageBitmap === "function" &&
    typeof OffscreenCanvas === "function"
  );
}

async function webpToEmbeddable(
  bytes: Uint8Array,
): Promise<{ kind: EmbedKind; bytes: Uint8Array }> {
  if (!canRasterizeWebp()) {
    throw new Error(
      "WebP conversion needs a browser that can decode images on-device. JPEG, PNG, and WebP are supported.",
    );
  }
  const blob = new Blob([copyBuffer(bytes)], { type: "image/webp" });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(
      Math.max(1, bitmap.width),
      Math.max(1, bitmap.height),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not convert this WebP image on-device.");
    }
    ctx.drawImage(bitmap, 0, 0);
    const out = await canvas.convertToBlob({ type: "image/png" });
    return { kind: "png", bytes: new Uint8Array(await out.arrayBuffer()) };
  } finally {
    bitmap.close();
  }
}

async function merge(files: TransferFile[]) {
  if (files.length === 0) {
    throw new Error("Choose at least one PDF to merge.");
  }
  const out = await PDFDocument.create();
  for (const file of files) {
    const src = await loadPdf(file);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const page of copied) out.addPage(page);
  }
  if (out.getPageCount() === 0) {
    throw new Error("Those PDFs have no pages to merge.");
  }
  return saved(out, "merged.pdf");
}

async function split(file: TransferFile, range: PageRange) {
  const src = await loadPdf(file);
  const count = src.getPageCount();
  if (count < 1) {
    throw new Error("This PDF has no pages to split.");
  }
  const start = clamp(Math.trunc(range.start), 1, count);
  const end = clamp(Math.trunc(range.end), 1, count);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const indices: number[] = range.pages
    ? [...range.pages]
    : Array.from({ length: hi - lo + 1 }, (_, i) => lo - 1 + i);
  if (
    !indices.length ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= count)
  )
    throw new Error("Choose valid pages from this PDF.");
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) out.addPage(page);
  return saved(out, "split.pdf");
}

async function imagesToPdf(files: TransferFile[], options?: ImagePdfOptions) {
  if (files.length === 0) {
    throw new Error("Choose at least one JPEG, PNG, or WebP image.");
  }
  const unsupported: string[] = [];
  const kinds: Array<Exclude<ImageKind, "other">> = [];
  for (const file of files) {
    const kind = imageKind(bytesOf(file), file.name, file.mime);
    if (kind === "other") unsupported.push(file.name || "unnamed");
    else kinds.push(kind);
  }
  if (unsupported.length > 0) {
    throw new Error(
      `Only JPEG, PNG, and WebP can be converted here. Unsupported: ${unsupported.join(", ")}.`,
    );
  }
  const prepared: Array<{ kind: EmbedKind; bytes: Uint8Array }> = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const kind = kinds[i];
    if (!file || !kind) continue;
    const bytes = bytesOf(file);
    prepared.push(
      kind === "webp" ? await webpToEmbeddable(bytes) : { kind, bytes },
    );
  }
  const out = await PDFDocument.create();
  for (const item of prepared) {
    const image =
      item.kind === "jpg"
        ? await out.embedJpg(item.bytes)
        : await out.embedPng(item.bytes);
    const margin = Math.max(0, Math.min(72, options?.margin ?? IMAGE_MARGIN));
    const paper = PAPER_SIZES[options?.size === "original" ? "a4" : (options?.size ?? "a4")];
    let width: number = paper.width;
    let height: number = paper.height;
    if (options?.landscape) [width, height] = [height, width];
    if (options?.size === "original") {
      width = image.width * 0.75 + margin * 2;
      height = image.height * 0.75 + margin * 2;
    }
    const dims = image.scaleToFit(width - margin * 2, height - margin * 2);
    const page = out.addPage([width, height]);
    page.drawImage(image, {
      x: (width - dims.width) / 2,
      y: (height - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  return saved(out, "images.pdf");
}

function watermarkOrigin(
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  textHeight: number,
  angleDeg: number,
): { x: number; y: number } {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: pageWidth / 2 - (textWidth / 2) * cos + (textHeight / 2) * sin,
    y: pageHeight / 2 - (textWidth / 2) * sin - (textHeight / 2) * cos,
  };
}

async function watermark(file: TransferFile, input: WatermarkInput) {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Enter watermark text.");
  }
  const opacity = clamp(input.opacity, 0.08, 0.35);
  const src = await loadPdf(file);
  const font = (await documentFonts(src, /[^\u0020-\u00ff]/u.test(text))).r;
  if (!supportsText(font, text))
    throw new Error(
      "This watermark contains characters the bundled fonts cannot render. Use another label to preserve readable text.",
    );
  for (const page of src.getPages()) {
    const { width, height } = page.getSize();
    let size = 48;
    const maxWidth = width * 0.8;
    const measured = font.widthOfTextAtSize(text, size);
    if (measured > maxWidth && measured > 0) {
      size = (size * maxWidth) / measured;
    }
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size);
    const angle = clamp(input.angle ?? WATERMARK_ANGLE, -90, 90);
    const origin = watermarkOrigin(width, height, textWidth, textHeight, angle);
    page.drawText(text, {
      x: origin.x,
      y: origin.y,
      size,
      font,
      rotate: degrees(angle),
      opacity,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
  return saved(src, "watermarked.pdf");
}

async function pageNumbers(file: TransferFile, options?: PageNumberOptions) {
  const src = await loadPdf(file);
  const font = await src.embedFont(StandardFonts.Helvetica);
  const pages = src.getPages();
  const total = pages.length;
  const size = 10;
  pages.forEach((page, index) => {
    const start = Math.max(1, Math.trunc(options?.start ?? 1));
    const n = index + start;
    const label =
      options?.total === false ? `${n}` : `${n} / ${total + start - 1}`;
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x:
        options?.position === "left"
          ? 24
          : options?.position === "right"
            ? page.getWidth() - textWidth - 24
            : (page.getWidth() - textWidth) / 2,
      y: 18,
      size,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });
  return saved(src, "numbered.pdf");
}

async function protect(
  file: TransferFile,
  input: ProtectInput,
): Promise<Pick<WorkerSuccess, "bytes" | "filename" | "pageCount">> {
  const password = input.userPassword;
  if (!password.trim()) {
    throw new Error("Enter a password to protect this PDF.");
  }
  const src = await loadPdf(file);
  const encrypted = await protectPdf(bytesOf(file), password);
  const copy = new Uint8Array(encrypted.byteLength);
  copy.set(encrypted);
  return {
    bytes: copy.buffer as ArrayBuffer,
    filename: "protected.pdf",
    pageCount: src.getPageCount(),
  };
}

async function organize(file: TransferFile, ops: OrganizeOp[]) {
  const src = await loadPdf(file);
  const count = src.getPageCount();
  if (count < 1) {
    throw new Error("This PDF has no pages to organize.");
  }

  // If a reorder op is present, that order is the new page sequence (copyPages).
  // Rotations then apply to indices in that resulting document.
  // Without a reorder, removes drop original indices; leftover rotate indices refer to remaining pages.
  const reorder = [...ops].reverse().find((op) => op.type === "reorder");
  let sequence: number[];
  if (reorder) {
    const seen = new Set<number>();
    sequence = [];
    for (const index of reorder.order) {
      if (index >= 0 && index < count && !seen.has(index)) {
        seen.add(index);
        sequence.push(index);
      }
    }
  } else {
    const removed = new Set<number>();
    for (const op of ops) {
      if (op.type === "remove" && op.pageIndex >= 0 && op.pageIndex < count) {
        removed.add(op.pageIndex);
      }
    }
    sequence = [];
    for (let i = 0; i < count; i++) {
      if (!removed.has(i)) sequence.push(i);
    }
  }

  if (sequence.length === 0) {
    throw new Error("Organize would remove every page.");
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, sequence);
  for (const page of copied) out.addPage(page);

  const pages = out.getPages();
  for (const op of ops) {
    if (op.type !== "rotate") continue;
    const page = pages[op.pageIndex];
    if (!page) continue;
    const current = toDegrees(page.getRotation());
    const next = (((current + op.degrees) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  }

  return saved(out, "organized.pdf");
}

async function pageCount(file: TransferFile): Promise<number> {
  const src = await loadPdf(file);
  return src.getPageCount();
}

async function docxToPdfOp(
  file: TransferFile,
): Promise<Pick<WorkerSuccess, "bytes" | "filename" | "pageCount" | "extra">> {
  const { docxToPdf } = await import("./docxToPdf");
  const result = await docxToPdf({
    name: file.name,
    mime: file.mime,
    bytes: bytesOf(file),
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  const copy = new Uint8Array(result.bytes.byteLength);
  copy.set(result.bytes);
  return {
    bytes: copy.buffer as ArrayBuffer,
    filename: result.filename,
    pageCount: result.pageCount ?? 0,
    extra: result.extra?.wordToPdf
      ? { wordToPdf: result.extra.wordToPdf }
      : undefined,
  };
}

export async function runWorkerOperation(
  req: WorkerRequest,
): Promise<Pick<WorkerSuccess, "bytes" | "filename" | "pageCount" | "extra">> {
  switch (req.op) {
    case "merge":
      return merge(req.files);
    case "split":
      return split(req.file, req.range);
    case "imagesToPdf":
      return imagesToPdf(req.files, req.options);
    case "watermark":
      return watermark(req.file, req.input);
    case "pageNumbers":
      return pageNumbers(req.file, req.options);
    case "optimize": {
      const pdf = await loadPdf(req.file);
      if (
        pdf
          .getForm()
          .getFields()
          .some((field) => field instanceof PDFSignature)
      ) {
        return {
          bytes: req.file.bytes,
          filename: "optimized.pdf",
          pageCount: pdf.getPageCount(),
        };
      }
      return saved(pdf, "optimized.pdf");
    }
    case "protect":
      return protect(req.file, req.input);
    case "organize":
      return organize(req.file, req.ops);
    case "pageCount":
      return { pageCount: await pageCount(req.file) };
    case "docxToPdf":
      return docxToPdfOp(req.file);
    default: {
      const _never: never = req;
      throw new Error(
        `Unknown PDF worker operation: ${JSON.stringify(_never)}`,
      );
    }
  }
}

function post(response: WorkerResponse, transfer: ArrayBuffer[] = []): void {
  self.postMessage(response, { transfer });
}

if (typeof self !== "undefined") {
  self.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isRequest(data)) return;
    void (async () => {
      try {
        const result = await runWorkerOperation(data);
        const transfer: ArrayBuffer[] = [];
        if (result.bytes) transfer.push(result.bytes);
        post(
          {
            id: data.id,
            ok: true,
            bytes: result.bytes,
            filename: result.filename,
            pageCount: result.pageCount,
            extra: result.extra,
          },
          transfer,
        );
      } catch (err) {
        post({ id: data.id, ok: false, message: humanError(err) });
      }
    })();
  });
}
