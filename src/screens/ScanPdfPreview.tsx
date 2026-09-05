import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnimatedButton } from "../components";
import { PAPER_SIZES } from "../lib/paperSizes";
import type { ImagePdfOptions, PickedFile } from "../lib/types";
import { toArrayBuffer } from "../store/files";

export function ScanPdfPreview({
  files,
  options,
}: {
  files: PickedFile[];
  options: ImagePdfOptions;
}) {
  const [index, setIndex] = useState(0);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  const urls = useMemo(
    () =>
      files.map((file) =>
        URL.createObjectURL(
          new Blob([toArrayBuffer(file.bytes)], { type: file.mime }),
        ),
      ),
    [files],
  );
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  useEffect(() => {
    if (index > files.length - 1) setIndex(Math.max(0, files.length - 1));
  }, [files.length, index]);

  const paper =
    options.size === "original" ? null : PAPER_SIZES[options.size];
  const ratio = ratios[index] || 0.7071;
  let paperW = paper?.width ?? 100;
  let paperH = paper?.height ?? 100 / ratio;
  if (!paper) {
    paperW = ratio >= 1 ? 100 : 100 * ratio;
    paperH = ratio >= 1 ? 100 / ratio : 100;
  } else if (options.landscape) {
    [paperW, paperH] = [paperH, paperW];
  }
  const pad = paperW > 0 ? (Math.max(0, options.margin) / paperW) * 100 : 0;
  const last = files.length - 1;
  if (files.length === 0) return null;

  return (
    <section className="ps-scan-preview" aria-label="PDF preview">
      <div
        className="ps-scan-preview__sheet"
        style={{
          ["--paper-w" as string]: String(paperW),
          ["--paper-h" as string]: String(paperH),
        }}
      >
        <div
          className="ps-scan-preview__inset"
          style={{ padding: `${pad}%` }}
        >
          {urls[index] ? (
            <img
              src={urls[index]}
              alt={`Page ${index + 1} of ${files.length}`}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!image.naturalWidth || !image.naturalHeight) return;
                const next = image.naturalWidth / image.naturalHeight;
                setRatios((current) =>
                  current[index] === next ? current : { ...current, [index]: next },
                );
              }}
            />
          ) : null}
        </div>
      </div>
      {files.length > 1 ? (
        <div className="ps-scan-preview__pager">
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={ChevronLeft}
            aria-label="Previous page"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          />
          <span className="tabular">
            {index + 1} / {files.length}
          </span>
          <AnimatedButton
            variant="ghost"
            className="btn--icon"
            icon={ChevronRight}
            aria-label="Next page"
            disabled={index >= last}
            onClick={() => setIndex((value) => Math.min(last, value + 1))}
          />
        </div>
      ) : null}
    </section>
  );
}
