import { projectiveMap, validCorners, type ScanEdit } from "./scanGeometry";
export type { ScanEdit };

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device cannot adjust the scan page.");
  return ctx;
}

export async function applyScanEdit(
  bytes: ArrayBuffer,
  mime: string,
  edit: ScanEdit,
): Promise<ArrayBuffer> {
  if (!validCorners(edit.corners))
    throw new Error(
      "Place the four corners around the page without crossing the edges.",
    );
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)),
    h = Math.max(1, Math.round(bitmap.height * scale));
  const source = new OffscreenCanvas(w, h);
  const ctx = context2d(source);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const points = edit.corners.map((p) => ({
    x: p.x * (w - 1),
    y: p.y * (h - 1),
  }));
  const dist = (a: number, b: number) =>
    Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y);
  const width = Math.max(1, Math.round((dist(0, 1) + dist(3, 2)) / 2));
  const height = Math.max(1, Math.round((dist(0, 3) + dist(1, 2)) / 2));
  const out = new OffscreenCanvas(width, height),
    oc = context2d(out);
  const result = oc.createImageData(width, height),
    data = result.data;
  const map = projectiveMap(points);
  const gray = edit.mode === "bw" ? new Uint8Array(width * height) : null;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = map(x / Math.max(1, width - 1), y / Math.max(1, height - 1));
      const sx = Math.max(0, Math.min(w - 1, p.x)),
        sy = Math.max(0, Math.min(h - 1, p.y));
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(w - 1, x0 + 1),
        y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0,
        fy = sy - y0,
        at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++)
        data[at + c] =
          (pixels[(y0 * w + x0) * 4 + c]! * (1 - fx) +
            pixels[(y0 * w + x1) * 4 + c]! * fx) *
            (1 - fy) +
          (pixels[(y1 * w + x0) * 4 + c]! * (1 - fx) +
            pixels[(y1 * w + x1) * 4 + c]! * fx) *
            fy;
      data[at + 3] = 255;
      if (edit.mode !== "color") {
        const v = Math.max(
          0,
          Math.min(
            255,
            (data[at]! * 0.299 +
              data[at + 1]! * 0.587 +
              data[at + 2]! * 0.114 -
              128) *
              1.2 +
              138,
          ),
        );
        data[at] = data[at + 1] = data[at + 2] = v;
        if (gray) gray[y * width + x] = v;
      }
    }
  if (gray) {
    const stride = width + 1,
      integral = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += gray[y * width + x]!;
        integral[(y + 1) * stride + x + 1] =
          integral[y * stride + x + 1]! + row;
      }
    }
    const radius = Math.max(8, Math.round(width / 50));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const l = Math.max(0, x - radius),
          r = Math.min(width, x + radius + 1),
          t = Math.max(0, y - radius),
          b = Math.min(height, y + radius + 1);
        const avg =
          (integral[b * stride + r]! -
            integral[t * stride + r]! -
            integral[b * stride + l]! +
            integral[t * stride + l]!) /
          ((r - l) * (b - t));
        const value = gray[y * width + x]! < avg - 10 ? 0 : 255;
        const at = (y * width + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = value;
      }
  }
  oc.putImageData(result, 0, 0);
  let target = out;
  const angle = edit.rotate === true ? 90 : Number(edit.rotate);
  const turn = ((angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(turn))
    throw new Error("Invalid page rotation.");
  if (turn) {
    target = new OffscreenCanvas(
      turn === 180 ? width : height,
      turn === 180 ? height : width,
    );
    const context = context2d(target);
    context.translate(
      turn === 90 ? height : turn === 180 ? width : 0,
      turn === 90 ? 0 : turn === 180 ? height : width,
    );
    context.rotate((turn * Math.PI) / 180);
    context.drawImage(out, 0, 0);
  }
  const blob = await target.convertToBlob({
    type: "image/jpeg",
    quality: 0.94,
  });
  return blob.arrayBuffer();
}
