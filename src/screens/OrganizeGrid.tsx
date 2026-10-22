import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ListOrdered, RotateCw } from "lucide-react";
import { useDragReorder } from "../components/useDragReorder";
import type { PickedFile } from "../lib/types";
import { engine } from "../pdf";
import { readableOrganizePdf } from "../store/organizeInput";
type Props = {
  file: PickedFile;
  /** Every page, in display order. */
  arrangement: number[];
  /** Kept pages in output order. */
  order: number[];
  rotations: Record<number, number>;
  disabled: boolean;
  active: boolean;
  onSelect: (page: number) => void;
  onMove: (from: number, to: number) => void;
  onTapOrder: (pages: number[]) => void;
  onRotate: (page: number) => void;
  onReady: (file: PickedFile, count: number) => void;
  onError: (message: string) => void;
};
/** One owned input session, serial visible-page work, at most 32 owned preview URLs. */
export function OrganizeGrid(props: Props) {
  const current = useRef(props),
    scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    current.current = props;
  }, [props]);
  const [count, setCount] = useState(0),
    [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true),
    [prompt, setPrompt] = useState<{
      incorrect: boolean;
      reply: (value: string) => void;
    } | null>(null),
    [password, setPassword] = useState("");
  const visible = useRef<Set<number>>(new Set()),
    schedule = useRef<() => void>(() => {});
  const cancelUnlock = useRef<() => void>(() => {});
  const stopOwner = useRef<() => void>(() => {});
  const cache = useRef(new Map<number, string>());
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const focusAfterMove = useRef<number | null>(null);
  const [tapSeq, setTapSeq] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const urls = new Map<number, string>();
    cache.current = urls;
    setTapSeq(null);
    setCount(0);
    setThumbs({});
    setLoading(true);
    setPrompt(null);
    setPassword("");
    visible.current.clear();
    return () => {
      stopOwner.current(); // Invalidate synchronously before any render continuation.
      const release = [...urls.values()];
      urls.clear();
      queueMicrotask(() => release.forEach((url) => URL.revokeObjectURL(url)));
    };
  }, [props.file]);
  useLayoutEffect(() => {
    if (!props.active) {
      stopOwner.current();
      setPrompt(null);
      setPassword("");
      setLoading(false);
    }
  }, [props.active]);
  useEffect(() => {
    if (!props.active) return;
    let active = true,
      running = false;
    const abort = new AbortController(),
      urls = cache.current,
      failed = new Set<number>();
    const owned = () =>
      active && current.current.active && current.current.file === props.file;
    let session: Awaited<ReturnType<typeof engine.openViewer>> | undefined,
      rejectPassword: ((reason: Error) => void) | undefined;
    const stop = () => {
      if (!active) return;
      active = false;
      abort.abort();
      rejectPassword?.(new Error("Cancelled"));
      schedule.current = () => {};
      if (session) void session.destroy();
    };
    stopOwner.current = stop;
    cancelUnlock.current = stop;
    setLoading(true);
    setPassword("");
    setPrompt(null);
    async function render() {
      if (!owned() || running || !session) return;
      running = true;
      try {
        while (owned()) {
          const index = [...visible.current].find(
            (i) => !urls.has(i) && !failed.has(i),
          );
          if (index === undefined) break;
          if (urls.size >= 32) {
            const old = [...urls.keys()].find((i) => !visible.current.has(i));
            if (old === undefined) break;
            URL.revokeObjectURL(urls.get(old)!);
            urls.delete(old);
          }
          let blob: Blob;
          try {
            blob = await session.renderPage(index, 300);
          } catch (error) {
            failed.add(index);
            if (owned())
              current.current.onError(
                error instanceof Error
                  ? error.message
                  : "Could not render this page.",
              );
            continue;
          }
          if (!owned()) break;
          const url = URL.createObjectURL(blob);
          urls.set(index, url);
          while (urls.size > 32) {
            const old = [...urls.keys()].find((i) => !visible.current.has(i));
            if (old === undefined) break;
            URL.revokeObjectURL(urls.get(old)!);
            urls.delete(old);
          }
          setThumbs(Object.fromEntries(urls));
        }
      } catch (error) {
        if (active)
          current.current.onError(
            error instanceof Error
              ? error.message
              : "Could not render page previews.",
          );
      } finally {
        running = false;
      }
    }
    schedule.current = () => {
      void render();
    };
    void (async () => {
      try {
        const file = await readableOrganizePdf(
          props.file,
          abort.signal,
          (incorrect) =>
            new Promise<string>((resolve, reject) => {
              if (!owned() || abort.signal.aborted) {
                reject(new Error("Cancelled"));
                return;
              }
              rejectPassword = reject;
              setPassword("");
              setPrompt({
                incorrect,
                reply: (value) => {
                  setPrompt(null);
                  setPassword("");
                  resolve(value);
                },
              });
            }),
        );
        if (!owned()) return;
        const opened = await engine.openViewer(file, undefined, {
          signal: abort.signal,
          indexText: false,
        });
        if (!owned()) {
          await opened.destroy();
          return;
        }
        session = opened;
        setCount(opened.document.pageCount);
        setLoading(false);
        current.current.onReady(file, opened.document.pageCount);
        void render();
      } catch (error) {
        if (active) {
          setLoading(false);
          current.current.onError(
            error instanceof Error ? error.message : "Could not open this PDF.",
          );
        }
      }
    })();
    return () => {
      stop();
      if (stopOwner.current === stop) stopOwner.current = () => {};
      if (cancelUnlock.current === stop) cancelUnlock.current = () => {};
    };
  }, [props.file, props.active]);
  useEffect(() => {
    if (!props.active || !count || !scroll.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) visible.current.add(page);
          else visible.current.delete(page);
        }
        schedule.current();
      },
      { root: scroll.current, rootMargin: "120px" },
    );
    scroll.current
      .querySelectorAll("[data-page]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [count, props.active]);
  const arrangement =
    props.arrangement.length === count
      ? props.arrangement
      : Array.from({ length: count }, (_, page) => page);
  const tapping = tapSeq !== null;
  const canDrag = count > 1 && !props.disabled && !tapping;
  const reorder = useDragReorder({
    keys: arrangement.map(String),
    enabled: canDrag,
    nodes: cardRefs,
    container: scroll,
    scroller: scroll,
    ignore: ".ps-organize-rotate",
    onMove: (from, to) => props.onMove(from, to),
  });
  useLayoutEffect(() => {
    const page = focusAfterMove.current;
    if (page === null) return;
    focusAfterMove.current = null;
    cardRefs.current
      .get(String(page))
      ?.querySelector<HTMLElement>(".ps-organize-select")
      ?.focus();
  });
  function pick(page: number): void {
    if (!tapSeq) return;
    const next = tapSeq.includes(page)
      ? tapSeq.filter((value) => value !== page)
      : [...tapSeq, page];
    if (next.length === count) {
      props.onTapOrder(next);
      setTapSeq(null);
      return;
    }
    setTapSeq(next);
  }
  function onKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (!canDrag) return;
    const direction =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : 0;
    const to = index + direction;
    if (!direction || to < 0 || to >= arrangement.length) return;
    event.preventDefault();
    focusAfterMove.current = arrangement[index]!;
    props.onMove(index, to);
  }
  return (
    <>
      {prompt ? (
        <form
          className="ps-banner"
          aria-label="Unlock PDF"
          onSubmit={(event) => {
            event.preventDefault();
            prompt.reply(password);
          }}
        >
          <p>
            {prompt.incorrect
              ? "That password was incorrect. Try again."
              : "This PDF is password protected."}
          </p>
          <label className="ps-field">
            Document password
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="ps-row">
            <button className="btn" type="submit">
              Unlock PDF
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                cancelUnlock.current();
                setPrompt(null);
                setPassword("");
                setLoading(false);
                current.current.onError(
                  "PDF unlock cancelled. Choose another file.",
                );
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {loading && !prompt ? <p role="status">Loading page previews…</p> : null}
      {count ? (
        <div className="order__bar">
          <div className="order__meta">
            <p className="order__count">
              {count} pages ·{" "}
              {tapping ? `${tapSeq.length} picked` : `${props.order.length} kept`}
            </p>
            <p className="order__status">
              {tapping
                ? "Tap pages in the order you want"
                : canDrag
                  ? "Hold and drag to reorder · Tap to leave a page out"
                  : "Tap to leave a page out"}
            </p>
          </div>
          {count > 1 ? (
            tapping ? (
              <button
                type="button"
                className="order__chip is-active"
                disabled={props.disabled}
                onClick={() => {
                  if (tapSeq.length) props.onTapOrder(tapSeq);
                  setTapSeq(null);
                }}
              >
                {tapSeq.length ? "Done" : "Cancel"}
              </button>
            ) : (
              <button
                type="button"
                className="order__chip"
                disabled={props.disabled}
                onClick={() => setTapSeq([])}
              >
                <ListOrdered size={16} strokeWidth={2.1} aria-hidden="true" />
                Tap order
              </button>
            )
          ) : null}
        </div>
      ) : null}
      <div
        ref={scroll}
        className={`ps-organize-grid${reorder.dragging ? " is-dragging" : ""}${
          reorder.settling ? " is-settling" : ""
        }`}
        role="region"
        aria-label="Page previews"
        tabIndex={0}
      >
        {arrangement.map((page, index) => {
          const kept = !tapping && props.order.includes(page);
          const position = tapping
            ? tapSeq.indexOf(page)
            : props.order.indexOf(page);
          const action = tapping
            ? `${position >= 0 ? "Unpick" : "Pick"} page ${page + 1}`
            : `${kept ? "Leave out" : "Keep"} page ${page + 1}`;
          const state = tapping
            ? position >= 0
              ? " is-selected"
              : ""
            : kept
              ? ""
              : " is-removed";
          return (
            <article
              className={`ps-organize-card${state}${
                reorder.dragIndex === index ? " is-lifted" : ""
              }`}
              key={page}
              data-page={page}
              ref={(node) => {
                if (node) cardRefs.current.set(String(page), node);
                else cardRefs.current.delete(String(page));
              }}
              style={reorder.style(index)}
              {...reorder.bind(index)}
            >
              <button
                className="ps-organize-select"
                disabled={props.disabled}
                aria-label={action}
                aria-pressed={tapping ? position >= 0 : kept}
                aria-describedby={canDrag ? "organize-help" : undefined}
                onClick={() => {
                  if (reorder.clickSuppressed()) return;
                  if (tapping) pick(page);
                  else props.onSelect(page);
                }}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="ps-organize-card__header">
                  <span>Page {page + 1}</span>
                  {position >= 0 ? (
                    <strong className="ps-organize-number">
                      {position + 1}
                    </strong>
                  ) : !tapping ? (
                    <span className="ps-organize-out">Out</span>
                  ) : null}
                </span>
                <span className="ps-organize-preview">
                  {thumbs[page] ? (
                    <img
                      src={thumbs[page]}
                      alt={`Page ${page + 1}`}
                      draggable={false}
                      style={{
                        transform: `rotate(${props.rotations[page] ?? 0}deg)`,
                      }}
                    />
                  ) : (
                    <span className="ps-muted">Preview</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="ps-organize-rotate"
                disabled={props.disabled}
                aria-label={`Rotate page ${page + 1} clockwise`}
                title="Rotate"
                onClick={() => props.onRotate(page)}
              >
                <RotateCw size={16} strokeWidth={2.3} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>
      {canDrag ? (
        <p id="organize-help" className="sr-only">
          Use arrow keys to move this page.
        </p>
      ) : null}
    </>
  );
}
