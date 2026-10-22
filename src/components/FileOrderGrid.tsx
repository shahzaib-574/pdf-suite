import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FilePenLine,
  FileText,
  Image as ImageIcon,
  ListOrdered,
  X,
} from "lucide-react";
import type { PickedFile } from "../lib/types";
import { engine } from "../pdf";
import { toArrayBuffer } from "../store/files";
import { movedOrder, useDragReorder } from "./useDragReorder";

export type OrderGridItem = {
  id: string;
  name: string;
  size: number;
  source?: PickedFile;
};

type Props = {
  items: OrderGridItem[];
  disabled: boolean;
  hint: string;
  /** One-file tools show a single wide preview card; + replaces the file. */
  single?: boolean;
  addControl: ReactNode;
  formatBytes: (size: number) => string;
  onReorder?: (order: number[]) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onRemove?: (index: number) => void;
};

type PreviewKind = "pdf" | "image" | "docx" | "other";

function previewKind(item: OrderGridItem): PreviewKind {
  const name = item.name.toLowerCase();
  const mime = item.source?.mime.toLowerCase() ?? "";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name))
    return "image";
  if (mime.includes("wordprocessingml") || name.endsWith(".docx"))
    return "docx";
  return "other";
}

// First-page previews are rendered once per input buffer and serially, so a
// large selection never runs several pdf.js documents at the same time.
const pdfPreviews = new WeakMap<Uint8Array, Promise<Blob | null>>();
let previewQueue: Promise<unknown> = Promise.resolve();

function pdfPreview(file: PickedFile): Promise<Blob | null> {
  const hit = pdfPreviews.get(file.bytes);
  if (hit) return hit;
  const work = previewQueue
    .then(() => engine.renderPage(file, 0, 240).catch(() => null))
    .then((blob) => {
      if (!blob) pdfPreviews.delete(file.bytes);
      return blob;
    });
  previewQueue = work;
  pdfPreviews.set(file.bytes, work);
  return work;
}

function OrderThumb({ item }: { item: OrderGridItem }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const source = item.source;
  const kind = previewKind(item);
  const pdf = kind === "pdf";
  const previewable = pdf || kind === "image";

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !source || !previewable) return;
    let url: string | null = null;
    let cancelled = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        if (!pdf) {
          url = URL.createObjectURL(
            new Blob([toArrayBuffer(source.bytes)], {
              type: source.mime || "image/jpeg",
            }),
          );
          setSrc(url);
          return;
        }
        void pdfPreview(source).then((blob) => {
          if (cancelled || !blob) return;
          url = URL.createObjectURL(blob);
          setSrc(url);
        });
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => {
      cancelled = true;
      io.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, pdf, previewable]);

  const Icon =
    kind === "image" ? ImageIcon : kind === "docx" ? FilePenLine : FileText;
  return (
    <span ref={rootRef} className="order-card__thumb" aria-hidden="true">
      {src ? (
        <img src={src} alt="" decoding="async" draggable={false} />
      ) : (
        <Icon size={26} strokeWidth={1.9} />
      )}
    </span>
  );
}

/** Reorderable first-page previews: long-press (touch) or drag (mouse), tap-to-sequence, or arrow keys. */
export function FileOrderGrid({
  items,
  disabled,
  hint,
  single = false,
  addControl,
  formatBytes,
  onReorder,
  onMove,
  onRemove,
}: Props) {
  const gridRef = useRef<HTMLOListElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const focusAfterMove = useRef<string | null>(null);
  const [tapIds, setTapIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const canOrder = Boolean(onReorder) && items.length > 1 && !disabled;
  // Ids are filtered during render so adding or removing files never leaves a
  // stale tap sequence behind.
  const liveIds = new Set(items.map((item) => item.id));
  const tapSeq = tapIds?.filter((id) => liveIds.has(id)) ?? null;
  const tapping = tapSeq !== null && canOrder;

  const reorder = useDragReorder({
    keys: items.map((item) => item.id),
    enabled: canOrder && !tapping,
    nodes: cardRefs,
    container: gridRef,
    ignore: "button",
    onMove(from, to) {
      onReorder?.(movedOrder(items.map((_, i) => i), from, to));
      setAnnouncement(
        `Moved ${items[from]!.name} to position ${to + 1} of ${items.length}.`,
      );
    },
    onTap: tapping ? (index) => tap(index) : undefined,
  });

  useLayoutEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    cardRefs.current.get(id)?.focus();
  });

  function tap(index: number): void {
    if (!tapSeq) return;
    const id = items[index]!.id;
    const next = tapSeq.includes(id)
      ? tapSeq.filter((value) => value !== id)
      : [...tapSeq, id];
    if (next.length === items.length) {
      applyTapOrder(next);
      return;
    }
    setTapIds(next);
  }

  function applyTapOrder(sequence: string[]): void {
    const chosen = new Set(sequence);
    const ids = [
      ...sequence,
      ...items.filter((item) => !chosen.has(item.id)).map((item) => item.id),
    ];
    const order = ids.map((id) => items.findIndex((item) => item.id === id));
    setTapIds(null);
    if (onReorder && order.some((from, to) => from !== to)) {
      onReorder(order);
      setAnnouncement("Files reordered.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number): void {
    if (event.target !== event.currentTarget || disabled) return;
    const item = items[index]!;
    if (tapping && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      tap(index);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && onRemove) {
      event.preventDefault();
      onRemove(index);
      return;
    }
    if (!onMove || !canOrder) return;
    const direction =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : 0;
    if (!direction) return;
    event.preventDefault();
    const to = index + direction;
    if (to < 0 || to >= items.length) return;
    focusAfterMove.current = item.id;
    onMove(index, direction);
    setAnnouncement(`Moved ${item.name} to position ${to + 1} of ${items.length}.`);
  }

  const status = single
    ? "Tap + to choose a different file"
    : tapping
      ? tapSeq.length
        ? `${tapSeq.length} of ${items.length} picked`
        : "Tap files in the order you want"
      : canOrder
        ? "Hold and drag to reorder"
        : hint;

  if (single) {
    const item = items[0];
    return (
      <div className="order">
        <div className="order__bar">
          <div className="order__meta">
            <p className="order__count">Selected file</p>
            <p className="order__status">{status}</p>
          </div>
          {addControl}
        </div>
        {item ? (
          <div className="order-solo">
            <OrderThumb item={item} />
            <div className="order-solo__meta">
              <span className="order-card__name" title={item.name}>
                {item.name}
              </span>
              <span className="order-card__size tabular">
                {formatBytes(item.size)}
              </span>
            </div>
            {onRemove ? (
              <button
                type="button"
                className="order-solo__remove"
                disabled={disabled}
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemove(0)}
              >
                <X size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="order">
      <div className="order__bar">
        <div className="order__meta">
          <p className="order__count">
            {items.length} {items.length === 1 ? "file" : "files"}
          </p>
          <p className="order__status">{status}</p>
        </div>
        {canOrder ? (
          tapping ? (
            <button
              type="button"
              className="order__chip is-active"
              onClick={() =>
                tapSeq.length ? applyTapOrder(tapSeq) : setTapIds(null)
              }
            >
              {tapSeq.length ? "Done" : "Cancel"}
            </button>
          ) : (
            <button
              type="button"
              className="order__chip"
              onClick={() => setTapIds([])}
            >
              <ListOrdered size={16} strokeWidth={2.1} aria-hidden="true" />
              Tap order
            </button>
          )
        ) : null}
        {addControl}
      </div>
      <ol
        ref={gridRef}
        className={`order__grid${reorder.dragging ? " is-dragging" : ""}${
          reorder.settling ? " is-settling" : ""
        }${tapping ? " is-tapping" : ""}`}
        aria-label="Selected files, in output order"
      >
        {items.map((item, index) => {
          const tapPosition = tapSeq ? tapSeq.indexOf(item.id) : -1;
          const badge = tapping
            ? tapPosition >= 0
              ? String(tapPosition + 1)
              : ""
            : String(index + 1);
          return (
            <li
              key={item.id}
              ref={(node) => {
                if (node) cardRefs.current.set(item.id, node);
                else cardRefs.current.delete(item.id);
              }}
              className={`order-card${reorder.dragIndex === index ? " is-lifted" : ""}${
                tapping && tapPosition >= 0 ? " is-picked" : ""
              }`}
              style={reorder.style(index)}
              tabIndex={disabled ? -1 : 0}
              aria-label={`${index + 1} of ${items.length}: ${item.name}, ${formatBytes(item.size)}`}
              aria-describedby={canOrder ? "order-help" : undefined}
              {...reorder.bind(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <OrderThumb item={item} />
              <span
                className={`order-card__badge tabular${badge ? "" : " is-empty"}`}
                aria-hidden="true"
              >
                {badge}
              </span>
              {onRemove && !tapping ? (
                <button
                  type="button"
                  className="order-card__remove"
                  disabled={disabled}
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onRemove(index)}
                >
                  <X size={14} strokeWidth={2.4} aria-hidden="true" />
                </button>
              ) : null}
              <span className="order-card__name" title={item.name}>
                {item.name}
              </span>
              <span className="order-card__size tabular">
                {formatBytes(item.size)}
              </span>
            </li>
          );
        })}
      </ol>
      {canOrder ? (
        <p id="order-help" className="sr-only">
          Use arrow keys to move this file. Delete removes it.
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
