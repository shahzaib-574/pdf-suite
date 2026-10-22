import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFDocument,
  type PDFObject,
} from "pdf-lib";

export type ImageCompressOptions = {
  /** Effective resolution for an image that fills the largest page. */
  dpi: number;
  /** JPEG quality, 0..1. */
  quality: number;
};

export type ImageCompressReport = {
  recompressed: number;
  savedBytes: number;
};

/** Below this, re-encoding costs more than it saves. */
const MIN_PIXELS = 160 * 160;
/** JPEG sources are decoded straight to their target size; raw (Flate)
 * sources need a full RGBA buffer, so they get a lower ceiling. */
const MAX_JPEG_PIXELS = 120_000_000;
const MAX_RAW_PIXELS = 40_000_000;
/** Output canvas ceiling (about 200 MB of RGBA) to stay safe on phones. */
const MAX_OUTPUT_PIXELS = 50_000_000;
/** A JPEG kept near its size is only re-encoded if it was stored wastefully. */
const RESIZE_WORTHWHILE = 0.9;
const WASTEFUL_JPEG_BYTES_PER_PIXEL = 0.5;
/** Line art and diagrams use few colours; JPEG would smear their edges. */
const MIN_PHOTO_COLOURS = 96;
/** Keep the original stream unless the new one is meaningfully smaller. */
const MIN_GAIN = 0.9;

const N = {
  Subtype: PDFName.of("Subtype"),
  Image: PDFName.of("Image"),
  ImageMask: PDFName.of("ImageMask"),
  Decode: PDFName.of("Decode"),
  DecodeParms: PDFName.of("DecodeParms"),
  Filter: PDFName.of("Filter"),
  Width: PDFName.of("Width"),
  Height: PDFName.of("Height"),
  BitsPerComponent: PDFName.of("BitsPerComponent"),
  ColorSpace: PDFName.of("ColorSpace"),
  SMask: PDFName.of("SMask"),
  Mask: PDFName.of("Mask"),
  DCTDecode: PDFName.of("DCTDecode"),
  FlateDecode: PDFName.of("FlateDecode"),
  DeviceRGB: PDFName.of("DeviceRGB"),
  DeviceGray: PDFName.of("DeviceGray"),
  ICCBased: PDFName.of("ICCBased"),
  Predictor: PDFName.of("Predictor"),
  Colors: PDFName.of("Colors"),
  Columns: PDFName.of("Columns"),
  N: PDFName.of("N"),
};

export function canRecompressImages(): boolean {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof DecompressionStream !== "undefined"
  );
}

function num(value: PDFObject | undefined): number {
  return value instanceof PDFNumber ? value.asNumber() : 0;
}

function singleFilter(dict: PDFDict): PDFName | null {
  const filter = dict.lookup(N.Filter);
  if (filter instanceof PDFName) return filter;
  if (filter instanceof PDFArray && filter.size() === 1) {
    const only = filter.lookup(0);
    return only instanceof PDFName ? only : null;
  }
  return null;
}

/** Component count for colour spaces a canvas can reproduce, else null. */
function components(dict: PDFDict): 1 | 3 | null {
  const space = dict.lookup(N.ColorSpace);
  if (space === N.DeviceRGB) return 3;
  if (space === N.DeviceGray) return 1;
  if (space instanceof PDFArray && space.lookup(0) === N.ICCBased) {
    const profile = space.lookup(1);
    const n = profile instanceof PDFStream ? num(profile.dict.lookup(N.N)) : 0;
    return n === 3 ? 3 : n === 1 ? 1 : null;
  }
  return null;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reverses PNG row filters (Predictor 10-15) for 8-bit samples. */
function unpredictPng(data: Uint8Array, rowBytes: number, bpp: number): Uint8Array {
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let y = 0; y < rows; y++) {
    const type = data[y * (rowBytes + 1)]!;
    const src = y * (rowBytes + 1) + 1;
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[src + x]!;
      const left = x >= bpp ? out[row + x - bpp]! : 0;
      const up = y > 0 ? out[prev + x]! : 0;
      const upLeft = y > 0 && x >= bpp ? out[prev + x - bpp]! : 0;
      let value: number;
      switch (type) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: throw new Error("Unsupported PNG predictor row.");
      }
      out[row + x] = value & 0xff;
    }
  }
  return out;
}

/** Samples the image; drawings and flat graphics have few distinct colours. */
function fewColours(samples: Uint8Array, pixels: number, channels: 1 | 3): boolean {
  const seen = new Set<number>();
  const step = Math.max(1, Math.floor(pixels / 40_000));
  for (let i = 0; i < pixels; i += step) {
    const j = i * channels;
    seen.add(
      channels === 3
        ? (samples[j]! << 16) | (samples[j + 1]! << 8) | samples[j + 2]!
        : samples[j]!,
    );
    if (seen.size >= MIN_PHOTO_COLOURS) return false;
  }
  return true;
}

async function flateBitmap(
  stream: PDFRawStream,
  width: number,
  height: number,
  channels: 1 | 3,
): Promise<ImageBitmap | null> {
  if (num(stream.dict.lookup(N.BitsPerComponent)) !== 8) return null;
  let samples = await inflate(stream.contents);
  const parms = stream.dict.lookup(N.DecodeParms);
  const predictor = parms instanceof PDFDict ? num(parms.lookup(N.Predictor)) : 0;
  if (predictor >= 10) {
    samples = unpredictPng(samples, width * channels, channels);
  } else if (predictor > 1) {
    return null;
  }
  if (samples.length < width * height * channels) return null;
  if (fewColours(samples, width * height, channels)) return null;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const o = i * 4;
    if (channels === 3) {
      rgba[o] = samples[j]!;
      rgba[o + 1] = samples[j + 1]!;
      rgba[o + 2] = samples[j + 2]!;
    } else {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = samples[j]!;
    }
    rgba[o + 3] = 255;
  }
  return createImageBitmap(new ImageData(rgba, width, height));
}

/**
 * Re-encodes embedded raster images as JPEG at a target resolution. Text,
 * vector art, links and forms are untouched because only image XObject
 * streams are replaced, and each one only when the result is smaller.
 */
export async function recompressImages(
  pdf: PDFDocument,
  options: ImageCompressOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<ImageCompressReport> {
  const report: ImageCompressReport = { recompressed: 0, savedBytes: 0 };
  if (!canRecompressImages()) return report;
  const context = pdf.context;
  const largestPage = Math.max(
    1,
    ...pdf.getPages().map((page) => {
      const { width, height } = page.getSize();
      return Math.max(width, height);
    }),
  );
  // An image is never shown larger than the largest page, so this caps its
  // pixels at the target DPI without needing to trace every placement.
  const maxSide = Math.max(256, Math.round((largestPage / 72) * options.dpi));

  // Soft masks and stencil masks carry transparency; JPEG would blur edges.
  const masks = new Set<string>();
  const candidates: Array<[PDFRef, PDFRawStream]> = [];
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue;
    for (const key of [N.SMask, N.Mask]) {
      const maskRef = object.dict.get(key);
      if (maskRef instanceof PDFRef) masks.add(maskRef.toString());
    }
    if (object instanceof PDFRawStream && object.dict.lookup(N.Subtype) === N.Image) {
      candidates.push([ref, object]);
    }
  }

  let processed = 0;
  const total = candidates.length;
  for (const [ref, object] of candidates) {
    processed++;
    onProgress?.(processed, total);
    if (masks.has(ref.toString())) continue;
    const dict = object.dict;
    if (dict.lookup(N.ImageMask) === PDFBool.True || dict.has(N.Decode)) continue;
    const width = num(dict.lookup(N.Width));
    const height = num(dict.lookup(N.Height));
    const pixels = width * height;
    if (pixels < MIN_PIXELS) continue;
    const channels = components(dict);
    const filter = singleFilter(dict);
    if (!channels || !filter) continue;
    const isJpeg = filter === N.DCTDecode;
    if (pixels > (isJpeg ? MAX_JPEG_PIXELS : MAX_RAW_PIXELS)) continue;

    const scale = Math.min(
      1,
      maxSide / Math.max(width, height),
      Math.sqrt(MAX_OUTPUT_PIXELS / pixels),
    );
    // Re-encoding a JPEG at nearly the same size only adds generation loss.
    if (
      isJpeg &&
      scale > RESIZE_WORTHWHILE &&
      object.contents.length / pixels < WASTEFUL_JPEG_BYTES_PER_PIXEL
    )
      continue;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    let bitmap: ImageBitmap | null = null;
    try {
      if (isJpeg) {
        bitmap = await createImageBitmap(
          new Blob([object.contents as BlobPart], { type: "image/jpeg" }),
          { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: "high" },
        );
      } else if (filter === N.FlateDecode) {
        bitmap = await flateBitmap(object, width, height, channels);
      }
      if (!bitmap) continue;
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const g = canvas.getContext("2d");
      if (!g) continue;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: options.quality,
      });
      const jpeg = new Uint8Array(await blob.arrayBuffer());
      if (jpeg.length >= object.contents.length * MIN_GAIN) continue;

      const next = dict.clone(context);
      next.set(N.Filter, N.DCTDecode);
      next.set(N.Width, PDFNumber.of(targetWidth));
      next.set(N.Height, PDFNumber.of(targetHeight));
      next.set(N.BitsPerComponent, PDFNumber.of(8));
      // Canvas JPEGs are always three-component; keep a matching RGB profile.
      if (channels === 1) next.set(N.ColorSpace, N.DeviceRGB);
      next.delete(N.DecodeParms);
      context.assign(ref, PDFRawStream.of(next, jpeg));
      report.recompressed++;
      report.savedBytes += object.contents.length - jpeg.length;
    } catch {
      // Undecodable or unusual image data stays exactly as it was.
    } finally {
      bitmap?.close();
    }
  }
  return report;
}
