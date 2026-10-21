import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import type { PickedFile } from "../lib/types";
import { engine } from "../pdf";
import { readableOrganizePdf } from "../store/organizeInput";
type Props = {
  file: PickedFile;
  order: number[];
  rotations: Record<number, number>;
  disabled: boolean;
  active: boolean;
  onSelect: (page: number) => void;
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
  useLayoutEffect(() => {
    const urls = new Map<number, string>();
    cache.current = urls;
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
          <button className="btn" type="submit">
            Unlock PDF
          </button>
          <button
            className="btn"
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
        </form>
      ) : null}
      {loading && !prompt ? <p role="status">Loading page previews…</p> : null}
      {count ? (
        <p className="ps-muted">
          {count} pages · {props.order.length} selected. Tap in the order you
          want.
        </p>
      ) : null}
      <div
        ref={scroll}
        className="ps-organize-grid"
        role="region"
        aria-label="Page previews"
        tabIndex={0}
      >
        {Array.from({ length: count }, (_, page) => {
          const position = props.order.indexOf(page);
          return (
            <article
              className={`ps-organize-card${position >= 0 ? " is-selected" : ""}`}
              key={page}
              data-page={page}
            >
              <button
                className="ps-organize-select"
                disabled={props.disabled}
                aria-label={`${position >= 0 ? "Deselect" : "Select"} page ${page + 1}`}
                aria-pressed={position >= 0}
                onClick={() => props.onSelect(page)}
              >
                <span className="ps-organize-card__header">
                  <span>Page {page + 1}</span>
                  {position >= 0 ? (
                    <strong className="ps-organize-number">
                      {position + 1}
                    </strong>
                  ) : null}
                </span>
                <span className="ps-organize-preview">
                  {thumbs[page] ? (
                    <img
                      src={thumbs[page]}
                      alt={`Page ${page + 1}`}
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
                className="btn btn--ghost ps-organize-rotate"
                disabled={props.disabled}
                aria-label={`Rotate page ${page + 1} clockwise`}
                onClick={() => props.onRotate(page)}
              >
                <RotateCw size={15} aria-hidden="true" /> Rotate
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
