import { PAPER_SIZES } from "./paperSizes";

export type ImagePdfPageOptions = {
  size: keyof typeof PAPER_SIZES | "original";
  landscape: boolean;
  margin: number;
};

export type ImagePdfPageBox = {
  width: number;
  height: number;
  margin: number;
};

export type ImagePdfDrawBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function imagePdfPageSize(
  options: ImagePdfPageOptions,
  image: { width: number; height: number },
): ImagePdfPageBox {
  const margin = Math.max(0, Math.min(72, options.margin));
  if (options.size === "original") {
    return {
      width: image.width * 0.75 + margin * 2,
      height: image.height * 0.75 + margin * 2,
      margin,
    };
  }
  const paper = PAPER_SIZES[options.size] ?? PAPER_SIZES.a4;
  return {
    width: options.landscape ? paper.height : paper.width,
    height: options.landscape ? paper.width : paper.height,
    margin,
  };
}

export function fitImageOnPdfPage(
  image: { width: number; height: number },
  page: ImagePdfPageBox,
): ImagePdfDrawBox {
  const boxW = Math.max(0, page.width - page.margin * 2);
  const boxH = Math.max(0, page.height - page.margin * 2);
  if (image.width <= 0 || image.height <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: page.margin, y: page.margin, width: boxW, height: boxH };
  }
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };
}

export function paperPreviewLabel(options: ImagePdfPageOptions): string {
  if (options.size === "original") return "Fit image";
  const paper = PAPER_SIZES[options.size]?.label ?? "A4";
  return `${paper} · ${options.landscape ? "Landscape" : "Portrait"}`;
}
