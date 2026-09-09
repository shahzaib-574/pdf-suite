import { useEffect, useRef, useState } from "react";
import { FilePenLine, FileText, Image as ImageIcon } from "lucide-react";
import { engine } from "../pdf";
import { toArrayBuffer } from "../store/files";
import { getRecent } from "../store/recents";

type FileKind = "pdf" | "image" | "docx" | "other";

export type FileThumbProps = {
  id: string;
  name: string;
  mime: string;
  stored?: boolean;
  size?: "sm" | "md";
};

const cache = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();
let pdfQueue: Promise<unknown> = Promise.resolve();

function fileKind(name: string, mime: string): FileKind {
  const n = name.toLowerCase();
  const m = mime.toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(n))
    return "image";
  if (m.includes("wordprocessingml") || n.endsWith(".docx")) return "docx";
  return "other";
}

function runPdf<T>(fn: () => Promise<T>): Promise<T> {
  const next = pdfQueue.then(fn, fn);
  pdfQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function loadThumb(
  id: string,
  mime: string,
  kind: "pdf" | "image",
): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  if (failed.has(id)) return Promise.resolve(null);
  const pending = inflight.get(id);
  if (pending) return pending;

  const work = (async () => {
    try {
      const file = await getRecent(id);
      if (!file?.bytes.length) {
        failed.add(id);
        return null;
      }
      if (kind === "image") {
        const url = URL.createObjectURL(
          new Blob([toArrayBuffer(file.bytes)], {
            type: file.mime || mime || "image/jpeg",
          }),
        );
        cache.set(id, url);
        return url;
      }
      const blob = await runPdf(() =>
        engine.renderPage(
          { name: file.name, mime: file.mime, bytes: file.bytes },
          0,
          120,
        ),
      );
      const url = URL.createObjectURL(blob);
      cache.set(id, url);
      return url;
    } catch {
      failed.add(id);
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, work);
  return work;
}

export function FileThumb({
  id,
  name,
  mime,
  stored = true,
  size = "md",
}: FileThumbProps) {
  const kind = fileKind(name, mime);
  const canPreview = stored && (kind === "pdf" || kind === "image");
  const [src, setSrc] = useState<string | null>(
    canPreview ? (cache.get(id) ?? null) : null,
  );
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!canPreview || src || failed.has(id)) return;
    if (kind !== "pdf" && kind !== "image") return;
    const previewKind = kind;
    const node = rootRef.current;
    if (!node) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        void loadThumb(id, mime, previewKind).then((url) => {
          if (!cancelled && url) setSrc(url);
        });
      },
      { rootMargin: "160px" },
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [canPreview, id, mime, kind, src]);

  const Icon =
    kind === "image" ? ImageIcon : kind === "docx" ? FilePenLine : FileText;
  const mark =
    kind === "pdf" ? "PDF" : kind === "image" ? "IMG" : kind === "docx" ? "DOC" : "FILE";

  return (
    <span
      ref={rootRef}
      className={
        size === "sm" ? "ps-file-thumb ps-file-thumb--sm" : "ps-file-thumb"
      }
      data-kind={kind}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" decoding="async" />
      ) : (
        <>
          <Icon size={size === "sm" ? 18 : 24} strokeWidth={2.05} />
          <span className="ps-file-thumb__mark">{mark}</span>
        </>
      )}
    </span>
  );
}
