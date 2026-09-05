import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnimatedButton } from "../components";
import {
  fitImageOnPdfPage,
  imagePdfPageSize,
  paperPreviewLabel,
} from "../lib/imagePdfPage";
import type { ImagePdfOptions, PickedFile } from "../lib/types";
import { toArrayBuffer } from "../store/files";

function previewMime(file: PickedFile): string {
  const mime = file.mime.trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (
    mime.startsWith("image/") &&
    mime !== "image/heic" &&
    mime !== "image/heif"
  ) {
    return mime;
  }
  const bytes = file.bytes;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50)
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

export function ScanPdfPreview({
  files,
  options,
}: {
  files: PickedFile[];
  options: ImagePdfOptions;
}) {
  const [index, setIndex] = useState(0);
  const [natural, setNatural] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const urls = useMemo(
    () =>
      files.map((file) =>
        URL.createObjectURL(
          new Blob([toArrayBuffer(file.bytes)], { type: previewMime(file) }),
        ),
      ),
    [files],
  );
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  const last = Math.max(0, files.length - 1);
  const pageIndex = Math.min(index, last);
  const measured = natural[pageIndex];
  const page = imagePdfPageSize(
    options,
    measured ?? { width: 1000, height: 1414 },
  );
  const draw = measured ? fitImageOnPdfPage(measured, page) : null;
  const label = paperPreviewLabel(options);
  if (files.length === 0) return null;

  return (
    <section className="ps-scan-preview" aria-label="PDF preview">
      <div className="ps-scan-preview__stage">
        <div
          className="ps-scan-preview__sheet"
          aria-label={label}
          style={{
            ["--paper-w" as string]: String(page.width),
            ["--paper-h" as string]: String(page.height),
          }}
        >
          {urls[pageIndex] ? (
            <img
              className={`ps-scan-preview__photo${draw ? "" : " is-measuring"}`}
              src={urls[pageIndex]}
              alt={`Page ${pageIndex + 1} of ${files.length}`}
              style={
                draw
                  ? {
                      left: `${(draw.x / page.width) * 100}%`,
                      top: `${((page.height - draw.y - draw.height) / page.height) * 100}%`,
                      width: `${(draw.width / page.width) * 100}%`,
                      height: `${(draw.height / page.height) * 100}%`,
                    }
                  : undefined
              }
              onLoad={(event) => {
                const node = event.currentTarget;
                if (!node.naturalWidth || !node.naturalHeight) return;
                setNatural((current) => {
                  const prev = current[pageIndex];
                  if (
                    prev &&
                    prev.width === node.naturalWidth &&
                    prev.height === node.naturalHeight
                  ) {
                    return current;
                  }
                  return {
                    ...current,
                    [pageIndex]: {
                      width: node.naturalWidth,
                      height: node.naturalHeight,
                    },
                  };
                });
              }}
            />
          ) : null}
        </div>
      </div>
      <p className="ps-scan-preview__label">{label}</p>
      {files.length > 1 ? (
        <div className="ps-scan-preview__pager">
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={ChevronLeft}
            aria-label="Previous page"
            disabled={pageIndex === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          />
          <span className="tabular">
            {pageIndex + 1} / {files.length}
          </span>
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={ChevronRight}
            aria-label="Next page"
            disabled={pageIndex >= last}
            onClick={() => setIndex((value) => Math.min(last, value + 1))}
          />
        </div>
      ) : null}
    </section>
  );
}
