import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Combine,
  FilePenLine,
  FilePlus,
  FileText,
  FolderOpen,
  List,
  ListOrdered,
  Lock,
  Minimize2,
  Minus,
  MoreVertical,
  PanelLeft,
  Plus,
  Search,
  Share2,
  Unlock,
  X,
} from "lucide-react";
import { AnimatedButton, PageHeader } from "../components";
import type { PickedFile, ToolId } from "../lib/types";
import { engine, unprotectPdf } from "../pdf";
import type {
  PdfViewerPage,
  PdfViewerPageRegion,
  PdfViewerSession,
  PdfViewerTextLayer,
} from "../pdf/render";
import { saveBytes, shareOrDownload } from "../store/files";
import {
  currentViewerBytes,
  currentViewerName,
  pendingViewerImport,
  setCurrentViewer,
  lastJob,
} from "../store/lastJob";
import { getRecent, saveRecent } from "../store/recents";
import { queueToolFiles } from "../store/toolInput";
import { useTheme } from "../theme/context";
import { navigate } from "./nav";

type ViewerProps = {
  recentId?: string;
};

type SidebarMode = "pages" | "outline" | null;

type SearchResult = {
  pageIndex: number;
  count: number;
};

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 100;
const ZOOM_FACTOR = 1.2;
const DETAIL_MAX_PIXELS = 8_000_000;
const DETAIL_MAX_DIM = 4096;

type ZoomFocal = {
  pageIndex: number;
  relX: number;
  relY: number;
  clientX: number;
  clientY: number;
};

type PinchSession = {
  distance: number;
  zoom: number;
  pageIndex: number;
  relX: number;
  relY: number;
  originX: number;
  originY: number;
  startMidX: number;
  startMidY: number;
  lastZoom: number;
  lastMid: { x: number; y: number };
  pending: { mid: { x: number; y: number }; distance: number } | null;
};

function zoomLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function occurrences(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(query, from);
    if (at < 0) break;
    count += 1;
    from = at + Math.max(1, query.length);
  }
  return count;
}

function touchDistance(event: TouchEvent): number {
  const first = event.touches[0];
  const second = event.touches[1];
  if (!first || !second) return 0;
  return Math.hypot(
    first.clientX - second.clientX,
    first.clientY - second.clientY,
  );
}

function touchMidpoint(event: TouchEvent): { x: number; y: number } | null {
  const first = event.touches[0];
  const second = event.touches[1];
  if (!first || !second) return null;
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

function captureZoomFocal(
  viewport: HTMLElement,
  clientX: number,
  clientY: number,
): ZoomFocal | null {
  const pages = viewport.querySelectorAll<HTMLElement>("[data-page-index]");
  let nearest: { el: HTMLElement; dist: number } | null = null;
  for (const el of pages) {
    const box = el.getBoundingClientRect();
    if (
      clientX >= box.left &&
      clientX <= box.right &&
      clientY >= box.top &&
      clientY <= box.bottom
    ) {
      return {
        pageIndex: Number(el.dataset.pageIndex ?? 0),
        relX: box.width > 0 ? (clientX - box.left) / box.width : 0.5,
        relY: box.height > 0 ? (clientY - box.top) / box.height : 0.5,
        clientX,
        clientY,
      };
    }
    const dx = clientX - Math.max(box.left, Math.min(clientX, box.right));
    const dy = clientY - Math.max(box.top, Math.min(clientY, box.bottom));
    const dist = dx * dx + dy * dy;
    if (!nearest || dist < nearest.dist) nearest = { el, dist };
  }
  if (!nearest) return null;
  const box = nearest.el.getBoundingClientRect();
  return {
    pageIndex: Number(nearest.el.dataset.pageIndex ?? 0),
    relX:
      box.width > 0
        ? Math.min(1, Math.max(0, (clientX - box.left) / box.width))
        : 0.5,
    relY:
      box.height > 0
        ? Math.min(1, Math.max(0, (clientY - box.top) / box.height))
        : 0.5,
    clientX,
    clientY,
  };
}

function applyZoomFocal(viewport: HTMLElement, focal: ZoomFocal): void {
  const pages = viewport.querySelector<HTMLElement>(".ps-reader-pages");
  clearLivePinchTransform(pages);
  const page = viewport.querySelector<HTMLElement>(
    `[data-page-index="${focal.pageIndex}"]`,
  );
  if (!page) return;
  void pages?.offsetWidth;
  const box = page.getBoundingClientRect();
  const width = page.offsetWidth;
  const height = page.offsetHeight;
  viewport.scrollLeft += box.left + focal.relX * width - focal.clientX;
  viewport.scrollTop += box.top + focal.relY * height - focal.clientY;
}

function clearLivePinchTransform(pages: HTMLElement | null): void {
  if (!pages) return;
  pages.style.transition = "none";
  pages.style.transform = "";
  pages.style.transformOrigin = "";
  pages.style.willChange = "";
  void pages.offsetWidth;
}

function applyLivePinch(pages: HTMLElement, pinch: PinchSession): number {
  const pending = pinch.pending;
  if (!pending) return pinch.lastZoom;
  const nextZoom = clampZoom(
    pinch.zoom * (pending.distance / pinch.distance),
  );
  const ratio = nextZoom / pinch.zoom;
  pages.style.transition = "none";
  pages.style.willChange = "transform";
  pages.style.transformOrigin = `${pinch.originX}px ${pinch.originY}px`;
  pages.style.transform = `translate(${pending.mid.x - pinch.startMidX}px, ${pending.mid.y - pinch.startMidY}px) scale(${ratio})`;
  pinch.lastZoom = nextZoom;
  pinch.lastMid = pending.mid;
  pinch.pending = null;
  return nextZoom;
}

export function Viewer({ recentId }: ViewerProps) {
  const { reducedMotion } = useTheme();
  const [name, setName] = useState("document.pdf");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [session, setSession] = useState<PdfViewerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("Opening document…");
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(420);
  const [sidebar, setSidebar] = useState<SidebarMode>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchCursor, setSearchCursor] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<"save" | "share" | null>(
    null,
  );
  const [indexedPages, setIndexedPages] = useState<PdfViewerPage[]>([]);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    incorrect: boolean;
    submit: (password: string) => void;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [locked, setLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const pagesRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLButtonElement>(null);
  const pinchRafRef = useRef(0);
  const wheelRafRef = useRef(0);
  const pinchRef = useRef<PinchSession | null>(null);
  const focalRef = useRef<ZoomFocal | null>(null);

  const backHash = recentId ? "#/recents" : lastJob.result ? "#/result" : "#/";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (recentId) {
        const item = await getRecent(recentId);
        if (cancelled) return;
        if (!item) {
          setError("File not found.");
          return;
        }
        setName(item.name);
        if (item.bytes.byteLength === 0) {
          setError(
            "No local copy is available. Choose the original file again.",
          );
          return;
        }
        setBytes(item.bytes);
        return;
      }
      const pending = pendingViewerImport;
      if(pending) {
        setName('Opening PDF');setLoadingLabel('Loading shared PDF…');
        const file=await pending;
        if(pendingViewerImport===pending)setCurrentViewer(file.bytes,file.name);
        if(cancelled)return;
        setName(file.name);setBytes(file.bytes);setLoadingLabel('Opening document…');
        return;
      }
      const job = lastJob.result;
      if (job && job.bytes.byteLength > 0) {
        setName(job.filename);
        setBytes(job.bytes);
        return;
      }
      if (currentViewerBytes && currentViewerBytes.byteLength > 0) {
        setName(currentViewerName);
        setBytes(currentViewerBytes);
        return;
      }
      setError("Nothing to open.");
    })().catch((error) => {
      if (!cancelled)
        setError(
          error instanceof Error
            ? error.message
            : "Could not load the local copy. Choose the original file again.",
        );
    });
    return () => {
      cancelled = true;
    };
  }, [recentId]);

  useEffect(() => {
    if (!bytes) return;
    setLocked(false);
    setUnlockPassword("");
    setMoreOpen(false);
    let cancelled = false;
    let opened: PdfViewerSession | null = null;
    const controller = new AbortController();
    const file: PickedFile = { name, mime: "application/pdf", bytes };
    void engine
      .openViewer(
        file,
        (current, total) => {
          if (!cancelled) {
            setLoadingLabel(
              current < total
                ? `Search indexing: ${current} of ${total} pages`
                : "Search index ready",
            );
            if (
              opened &&
              (current === 1 || current % 8 === 0 || current === total)
            )
              setIndexedPages([...opened.document.pages]);
          }
        },
        {
          signal: controller.signal,
          onPassword: (incorrect) =>
            new Promise<string>((resolve) => {
              if (!cancelled) {
                setLocked(true);
                setPassword("");
                setPasswordPrompt({
                  incorrect,
                  submit: (value) => {
                    setUnlockPassword(value);
                    setPasswordPrompt(null);
                    resolve(value);
                  },
                });
              }
            }),
        },
      )
      .then((viewer) => {
        opened = viewer;
        if (cancelled) {
          void viewer.destroy();
          return;
        }
        setSession(viewer);
        setIndexedPages([...viewer.document.pages]);
        setActivePage(0);
        setLoadingLabel("Opening document…");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open PDF");
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (opened) void opened.destroy();
    };
  }, [bytes, name]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewportWidth(entry.contentRect.width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [session, sidebar]);

  const updateActivePage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const center =
      viewport.getBoundingClientRect().top + viewport.clientHeight * 0.36;
    const pages = viewport.querySelectorAll<HTMLElement>("[data-page-index]");
    let closest = activePage;
    let distance = Number.POSITIVE_INFINITY;
    pages.forEach((page) => {
      const box = page.getBoundingClientRect();
      const current = Math.abs(
        box.top + Math.min(box.height * 0.2, 100) - center,
      );
      if (current < distance) {
        distance = current;
        closest = Number(page.dataset.pageIndex ?? 0);
      }
    });
    setActivePage((previous) => (previous === closest ? previous : closest));
  }, [activePage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !session) return;
    const onScroll = () => {
      if (scrollFrameRef.current != null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateActivePage();
      });
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (scrollFrameRef.current != null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [session, updateActivePage]);

  const goToPage = useCallback(
    (pageIndex: number, smooth = true) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounded = Math.max(
        0,
        Math.min(
          session?.document.pageCount ? session.document.pageCount - 1 : 0,
          pageIndex,
        ),
      );
      const page = viewport.querySelector<HTMLElement>(
        `[data-page-index="${bounded}"]`,
      );
      page?.scrollIntoView({
        behavior: smooth && !reducedMotion ? "smooth" : "auto",
        block: "start",
      });
      setActivePage(bounded);
    },
    [reducedMotion, session],
  );

  const rememberFocal = useCallback((clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const focal = captureZoomFocal(viewport, clientX, clientY);
    if (focal) focalRef.current = focal;
  }, []);

  const zoomAroundViewportCenter = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (viewport) {
        const box = viewport.getBoundingClientRect();
        rememberFocal(box.left + box.width / 2, box.top + box.height / 2);
      }
      setZoom((value) => clampZoom(value * factor));
    },
    [rememberFocal],
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const writeZoomLabel = useCallback((value: number) => {
    const label = zoomLabelRef.current;
    if (label) label.textContent = zoomLabel(value);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "f"
      ) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.key === "+" || event.key === "=") {
        zoomAroundViewportCenter(ZOOM_FACTOR);
      } else if (event.key === "-") {
        zoomAroundViewportCenter(1 / ZOOM_FACTOR);
      } else if (event.key === "0") {
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomAroundViewportCenter]);

  useEffect(() => {
    if (searchOpen)
      window.setTimeout(() => searchInputRef.current?.focus(), 40);
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!session || normalizedQuery.length < 2) return [];
    return indexedPages.flatMap((page, pageIndex) => {
      const lower = page.text.toLocaleLowerCase();
      const count = occurrences(lower, normalizedQuery);
      return count > 0 ? [{ pageIndex, count }] : [];
    });
  }, [normalizedQuery, session, indexedPages]);
  const totalMatches = useMemo(
    () => searchResults.reduce((sum, result) => sum + result.count, 0),
    [searchResults],
  );

  function moveSearch(direction: -1 | 1): void {
    if (searchResults.length === 0) return;
    const next =
      (searchCursor + direction + searchResults.length) % searchResults.length;
    setSearchCursor(next);
    goToPage(searchResults[next]!.pageIndex);
  }

  function currentPdf(): PickedFile | null {
    if (!bytes) return null;
    return {
      name,
      mime: "application/pdf",
      bytes,
      password: unlockPassword || undefined,
    };
  }

  function openTool(tool: ToolId): void {
    const file = currentPdf();
    if (!file) return;
    setMoreOpen(false);
    queueToolFiles(tool, [file]);
    navigate(`#/tool/${tool}`);
  }

  async function removePassword(): Promise<void> {
    if (!bytes || !unlockPassword) return;
    setMoreOpen(false);
    setMessage(null);
    try {
      const plain = await unprotectPdf(bytes, unlockPassword);
      const filename = name.replace(/\.pdf$/i, "") + "-unlocked.pdf";
      await saveRecent({
        name: filename,
        mime: "application/pdf",
        tool: "protect",
        bytes: plain,
      }).catch(() => undefined);
      setCurrentViewer(plain, filename);
      setName(filename);
      setBytes(plain);
      setLocked(false);
      setUnlockPassword("");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not remove the password.",
      );
    }
  }

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setMoreOpen(false);
    }
    function onPointer(event: Event): void {
      const node = event.target;
      if (node instanceof Node && moreRef.current?.contains(node)) return;
      setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [moreOpen]);

  async function onShare(): Promise<void> {
    if (!bytes) return;
    setMessage(null);
    setActiveExport("share");
    try {
      const result = await shareOrDownload(bytes, name, "application/pdf");
      if (result.status === "cancelled") return;
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not share this PDF",
      );
    } finally {
      setActiveExport(null);
    }
  }

  async function onSave(): Promise<void> {
    if (!bytes) return;
    setMessage(null);
    setActiveExport("save");
    try {
      const result = await saveBytes(bytes, name, "application/pdf");
      if (result.status === "cancelled") return;
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not save this PDF",
      );
    } finally {
      setActiveExport(null);
    }
  }

  const maxPageWidth = useMemo(
    () => indexedPages.reduce((max, page) => Math.max(max, page.width), 1),
    [indexedPages],
  );
  const pageGutter = viewportWidth < 620 ? 24 : 52;
  const fitScale = Math.max(0.1, (viewportWidth - pageGutter) / maxPageWidth);
  const displayScale = fitScale * zoom;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const focal = focalRef.current;
    if (!viewport || !focal || pinchRef.current) return;
    applyZoomFocal(viewport, focal);
  }, [displayScale, viewportWidth, zoom]);

  const paintWidth = Math.min(
    2048,
    Math.max(
      720,
      (viewportWidth - pageGutter) * Math.min(window.devicePixelRatio || 1, 2),
    ),
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const pages = pagesRef.current;
    if (!viewport || !pages || !session) return;

    let pinchLive = false;

    const stopPinchRaf = () => {
      if (pinchRafRef.current) {
        cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = 0;
      }
    };

    const paintPinch = () => {
      pinchRafRef.current = 0;
      const pinch = pinchRef.current;
      if (!pinchLive || !pinch) return;
      writeZoomLabel(applyLivePinch(pages, pinch));
    };

    const commitPinch = () => {
      const pinch = pinchRef.current;
      if (!pinch) return;
      pinchLive = false;
      stopPinchRaf();
      pinchRef.current = null;
      if (pinch.pending) {
        pinch.lastZoom = clampZoom(
          pinch.zoom * (pinch.pending.distance / pinch.distance),
        );
        pinch.lastMid = pinch.pending.mid;
        pinch.pending = null;
      }
      focalRef.current = {
        pageIndex: pinch.pageIndex,
        relX: pinch.relX,
        relY: pinch.relY,
        clientX: pinch.lastMid.x,
        clientY: pinch.lastMid.y,
      };
      clearLivePinchTransform(pages);
      writeZoomLabel(pinch.lastZoom);
      zoomRef.current = pinch.lastZoom;
      flushSync(() => {
        setZoom(pinch.lastZoom);
      });
      applyZoomFocal(viewport, focalRef.current);
      viewport.classList.remove("is-pinching");
      viewport.dispatchEvent(new Event("reader-pinch-end"));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const mid = touchMidpoint(event);
      const distance = touchDistance(event);
      if (!mid || distance <= 0) return;
      const focal = captureZoomFocal(viewport, mid.x, mid.y);
      if (!focal) return;
      const box = pages.getBoundingClientRect();
      stopPinchRaf();
      pinchLive = true;
      pinchRef.current = {
        distance,
        zoom: zoomRef.current,
        pageIndex: focal.pageIndex,
        relX: focal.relX,
        relY: focal.relY,
        originX: mid.x - box.left,
        originY: mid.y - box.top,
        startMidX: mid.x,
        startMidY: mid.y,
        lastZoom: zoomRef.current,
        lastMid: mid,
        pending: null,
      };
      focalRef.current = focal;
      viewport.classList.add("is-pinching");
      viewport.dispatchEvent(new Event("reader-pinch-start"));
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      const mid = touchMidpoint(event);
      if (!pinch || !mid || event.touches.length !== 2 || pinch.distance <= 0)
        return;
      event.preventDefault();
      pinch.pending = { mid, distance: touchDistance(event) };
      if (!pinchRafRef.current) {
        pinchRafRef.current = window.requestAnimationFrame(paintPinch);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      commitPinch();
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (pinchLive || pinchRef.current) return;
      rememberFocal(event.clientX, event.clientY);
      const next = clampZoom(
        zoomRef.current * Math.exp(-event.deltaY * 0.0024),
      );
      zoomRef.current = next;
      writeZoomLabel(next);
      if (wheelRafRef.current) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        wheelRafRef.current = 0;
        setZoom(zoomRef.current);
      });
    };

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd);
    viewport.addEventListener("touchcancel", onTouchEnd);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pinchLive = false;
      stopPinchRaf();
      if (wheelRafRef.current) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = 0;
      }
      viewport.classList.remove("is-pinching");
      clearLivePinchTransform(pages);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [rememberFocal, session, writeZoomLabel]);

  const emptyCopy = recentId
    ? {
        title: "Preview unavailable",
        body:
          error === "File not found."
            ? "That recent file is no longer on this device."
            : error === "Nothing to open."
              ? "Choose a PDF from Recents or Tools to read it here."
              : (error ?? "This file is too large to keep in Recents."),
        action: "Back to Recents",
        href: "#/recents",
      }
    : error === "Nothing to open."
      ? {
          title: "No PDF open",
          body: "Choose a PDF from Tools or Recents to read it here.",
          action: "Browse tools",
          href: "#/",
        }
      : {
          title: "Could not open PDF",
          body: error ?? "Choose another file and try again.",
          action: "Browse tools",
          href: "#/",
        };

  return (
    <div className="ps-screen ps-screen--viewer" aria-label="Reader">
      <PageHeader
        subtitle={error ? undefined : name}
        onBack={() => navigate(backHash)}
      />
      {passwordPrompt ? (
        <form
          className="ps-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (password) passwordPrompt.submit(password);
          }}
        >
          <h2>Unlock this PDF</h2>
          <p>
            {passwordPrompt.incorrect
              ? "That password was incorrect. Try again."
              : "Enter the document password to read it. It is used only for this session."}
          </p>
          <label className="ps-field">
            Document password
            <input
              autoFocus
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <AnimatedButton type="submit" disabled={!password}>
            Open PDF
          </AnimatedButton>
          <AnimatedButton variant="ghost" onClick={() => navigate(backHash)}>
            Cancel
          </AnimatedButton>
        </form>
      ) : error ? (
        <div className="ps-body">
          <div className="ps-empty-state">
            <span className="ps-empty-state__icon" aria-hidden="true">
              <FileText size={28} />
            </span>
            <h2>{emptyCopy.title}</h2>
            <p>{emptyCopy.body}</p>
            <AnimatedButton
              icon={FolderOpen}
              onClick={() => navigate(emptyCopy.href)}
            >
              {emptyCopy.action}
            </AnimatedButton>
          </div>
        </div>
      ) : !session ? (
        <div className="ps-reader-state" role="status" aria-live="polite">
          <span className="ps-reader-loader" aria-hidden="true" />
          <strong>{loadingLabel}</strong>
          <span>Everything is being prepared on this device.</span>
        </div>
      ) : (
        <div className="ps-reader">
          {searchOpen ? (
            <p className="ps-note" role="status">
              {loadingLabel}
            </p>
          ) : null}
          <div className="ps-reader-toolbar" aria-label="Reader controls">
            <div className="ps-reader-toolbar__group">
              <ReaderIconButton
                label={
                  sidebar ? "Close navigation panel" : "Show page navigation"
                }
                active={sidebar !== null}
                onClick={() => setSidebar((value) => (value ? null : "pages"))}
              >
                <PanelLeft size={18} />
              </ReaderIconButton>
              <label className="ps-reader-page-input">
                <span className="sr-only">Page number</span>
                <input
                  type="number"
                  min={1}
                  max={session.document.pageCount}
                  value={activePage + 1}
                  onChange={(event) => goToPage(Number(event.target.value) - 1)}
                />
                <span>/ {session.document.pageCount}</span>
              </label>
            </div>
            <div className="ps-reader-toolbar__group ps-reader-zoom">
              <ReaderIconButton
                label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => zoomAroundViewportCenter(1 / ZOOM_FACTOR)}
              >
                <Minus size={17} />
              </ReaderIconButton>
              <button
                ref={zoomLabelRef}
                type="button"
                className="ps-reader-zoom__value"
                aria-label="Fit pages to width"
                title="Fit to width"
                onClick={() => {
                  const viewport = viewportRef.current;
                  if (viewport) {
                    const box = viewport.getBoundingClientRect();
                    rememberFocal(
                      box.left + box.width / 2,
                      box.top + box.height / 2,
                    );
                  }
                  setZoom(1);
                }}
              >
                {zoomLabel(zoom)}
              </button>
              <ReaderIconButton
                label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => zoomAroundViewportCenter(ZOOM_FACTOR)}
              >
                <Plus size={17} />
              </ReaderIconButton>
            </div>
            <div className="ps-reader-toolbar__group">
              <ReaderIconButton
                label="Find in document"
                active={searchOpen}
                onClick={() => setSearchOpen((value) => !value)}
              >
                <Search size={18} />
              </ReaderIconButton>
              <ReaderIconButton
                label={activeExport === "share" ? "Sharing PDF" : "Share PDF"}
                disabled={activeExport !== null}
                onClick={() => void onShare()}
              >
                <Share2 size={18} />
              </ReaderIconButton>
              <ReaderIconButton
                label={activeExport === "save" ? "Saving PDF" : "Save PDF"}
                disabled={!bytes || activeExport !== null}
                onClick={() => void onSave()}
              >
                <Download size={18} />
              </ReaderIconButton>
            </div>
          </div>

          {searchOpen ? (
            <div className="ps-reader-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                placeholder="Find in document"
                aria-label="Find in document"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter")
                    moveSearch(event.shiftKey ? -1 : 1);
                }}
              />
              <span className="ps-reader-search__count" aria-live="polite">
                {normalizedQuery.length < 2
                  ? "Type 2+ letters"
                  : totalMatches > 0
                    ? `${totalMatches} match${totalMatches === 1 ? "" : "es"}`
                    : "No matches"}
              </span>
              <ReaderIconButton
                label="Previous match"
                disabled={searchResults.length === 0}
                onClick={() => moveSearch(-1)}
              >
                <ChevronLeft size={17} />
              </ReaderIconButton>
              <ReaderIconButton
                label="Next match"
                disabled={searchResults.length === 0}
                onClick={() => moveSearch(1)}
              >
                <ChevronRight size={17} />
              </ReaderIconButton>
              <ReaderIconButton
                label="Close search"
                onClick={() => setSearchOpen(false)}
              >
                <X size={17} />
              </ReaderIconButton>
            </div>
          ) : null}

          {message ? (
            <p className="ps-reader-message" role="status">
              {message}
            </p>
          ) : null}

          <div className="ps-reader-workspace">
            {sidebar ? (
              <aside
                className="ps-reader-sidebar"
                aria-label="Document navigation"
              >
                <div className="ps-reader-sidebar__tabs">
                  <button
                    type="button"
                    className={sidebar === "pages" ? "is-active" : ""}
                    onClick={() => setSidebar("pages")}
                  >
                    <List size={16} /> Pages
                  </button>
                  <button
                    type="button"
                    className={sidebar === "outline" ? "is-active" : ""}
                    onClick={() => setSidebar("outline")}
                  >
                    <Bookmark size={16} /> Outline
                  </button>
                </div>
                {sidebar === "pages" ? (
                  <div className="ps-reader-thumbnails">
                    {session.document.pages.map((page, pageIndex) => (
                      <ReaderThumbnail
                        key={pageIndex}
                        session={session}
                        page={page}
                        pageIndex={pageIndex}
                        active={activePage === pageIndex}
                        onSelect={() => {
                          goToPage(pageIndex);
                          if (window.innerWidth < 760) setSidebar(null);
                        }}
                      />
                    ))}
                  </div>
                ) : session.document.outline.length > 0 ? (
                  <nav
                    className="ps-reader-outline"
                    aria-label="Document outline"
                  >
                    {session.document.outline.map((item, index) => (
                      <button
                        type="button"
                        key={`${item.pageIndex}-${index}`}
                        style={{ paddingInlineStart: 12 + item.depth * 14 }}
                        onClick={() => {
                          goToPage(item.pageIndex);
                          if (window.innerWidth < 760) setSidebar(null);
                        }}
                      >
                        <span>{item.title}</span>
                        <span>{item.pageIndex + 1}</span>
                      </button>
                    ))}
                  </nav>
                ) : (
                  <div className="ps-reader-sidebar__empty">
                    <Bookmark size={22} aria-hidden="true" />
                    <span>This PDF has no outline.</span>
                  </div>
                )}
              </aside>
            ) : null}

            <div ref={viewportRef} className="ps-reader-viewport">
              <div ref={pagesRef} className="ps-reader-pages">
                {session.document.pages.map((page, pageIndex) => (
                  <ReaderPage
                    key={pageIndex}
                    session={session}
                    page={page}
                    pageIndex={pageIndex}
                    displayScale={displayScale}
                    renderWidth={paintWidth}
                    query={normalizedQuery}
                    active={activePage === pageIndex}
                    viewportRef={viewportRef}
                  />
                ))}
              </div>
            </div>
          </div>
          <nav className="ps-reader-dock" aria-label="PDF tools">
            <button type="button" onClick={() => openTool("merge")}>
              <FilePlus size={22} strokeWidth={2.1} aria-hidden="true" />
              Add
            </button>
            <button type="button" onClick={() => openTool("organize")}>
              <ListOrdered size={22} strokeWidth={2.1} aria-hidden="true" />
              Organize
            </button>
            <button type="button" onClick={() => openTool("compress")}>
              <Minimize2 size={22} strokeWidth={2.1} aria-hidden="true" />
              Compress
            </button>
            <button type="button" onClick={() => openTool("pdf-docx")}>
              <FilePenLine size={22} strokeWidth={2.1} aria-hidden="true" />
              Word
            </button>
            <div ref={moreRef} className="ps-reader-more">
              <button
                type="button"
                aria-label="More tools"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <MoreVertical size={22} strokeWidth={2.1} aria-hidden="true" />
                More
              </button>
              {moreOpen ? (
                <div className="ps-reader-more__menu" role="menu">
                  {locked ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!unlockPassword}
                      onClick={() => void removePassword()}
                    >
                      <Unlock size={16} strokeWidth={2.1} aria-hidden="true" />
                      Remove password
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openTool("protect")}
                    >
                      <Lock size={16} strokeWidth={2.1} aria-hidden="true" />
                      Protect PDF
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openTool("merge")}
                  >
                    <Combine size={16} strokeWidth={2.1} aria-hidden="true" />
                    Merge PDFs
                  </button>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

type ReaderIconButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ReaderIconButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: ReaderIconButtonProps) {
  return (
    <button
      type="button"
      className={
        active ? "ps-reader-icon-button is-active" : "ps-reader-icon-button"
      }
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type ReaderPageProps = {
  session: PdfViewerSession;
  page: PdfViewerPage;
  pageIndex: number;
  displayScale: number;
  renderWidth: number;
  query: string;
  active: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

type PageDetail = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function ReaderPage({
  session,
  page,
  pageIndex,
  displayScale,
  renderWidth,
  query,
  active,
  viewportRef,
}: ReaderPageProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderedTextRef = useRef<PdfViewerTextLayer | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const queryRef = useRef(query);
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const detailUrlRef = useRef<string | null>(null);
  const detailGen = useRef(0);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting === true);
      },
      { rootMargin: "1400px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void session
      .renderPage(pageIndex, renderWidth)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        setSrc(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRenderError(
            err instanceof Error ? err.message : "Could not render this page",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageIndex, renderWidth, session, visible]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!visible || !textLayerRef.current || !page.text) return;
    let cancelled = false;
    const container = textLayerRef.current;
    container.replaceChildren();
    void session
      .renderTextLayer(pageIndex, container, 1)
      .then((layer) => {
        if (cancelled) {
          layer.cancel();
          return;
        }
        renderedTextRef.current = layer;
        markTextLayer(layer, queryRef.current);
      })
      .catch(() => {
        container.replaceChildren();
      });
    return () => {
      cancelled = true;
      renderedTextRef.current?.cancel();
      renderedTextRef.current = null;
      container.replaceChildren();
    };
  }, [page.text, pageIndex, session, visible]);

  useEffect(() => {
    if (renderedTextRef.current) markTextLayer(renderedTextRef.current, query);
  }, [query]);

  const dpr = Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    3,
  );
  const sharpEnough =
    page.width * displayScale * dpr <= renderWidth * 1.12;
  const needsDetail = visible && displayScale > 0 && !sharpEnough;

  useEffect(() => {
    const viewport = viewportRef.current;
    const pageEl = pageRef.current;
    if (!viewport || !pageEl || !needsDetail) {
      return;
    }

    let timer = 0;
    const paint = () => {
      if (viewport.classList.contains("is-pinching")) return;
      const pageBox = pageEl.getBoundingClientRect();
      const viewBox = viewport.getBoundingClientRect();
      const pad = 64;
      const cssLeft = Math.max(0, viewBox.left - pageBox.left - pad);
      const cssTop = Math.max(0, viewBox.top - pageBox.top - pad);
      const cssRight = Math.min(
        pageBox.width,
        viewBox.right - pageBox.left + pad,
      );
      const cssBottom = Math.min(
        pageBox.height,
        viewBox.bottom - pageBox.top + pad,
      );
      const cssW = cssRight - cssLeft;
      const cssH = cssBottom - cssTop;
      if (cssW < 8 || cssH < 8) {
        return;
      }
      let outW = Math.max(1, Math.round(cssW * dpr));
      let outH = Math.max(1, Math.round(cssH * dpr));
      const fit = Math.min(
        1,
        DETAIL_MAX_DIM / outW,
        DETAIL_MAX_DIM / outH,
        Math.sqrt(DETAIL_MAX_PIXELS / Math.max(1, outW * outH)),
      );
      outW = Math.max(1, Math.round(outW * fit));
      outH = Math.max(1, Math.round(outH * fit));
      const generation = ++detailGen.current;
      void session
        .renderPageRegion(
          pageIndex,
          {
            x: cssLeft / displayScale,
            y: cssTop / displayScale,
            width: cssW / displayScale,
            height: cssH / displayScale,
          },
          outW,
          outH,
        )
        .then(async (region: PdfViewerPageRegion) => {
          if (generation !== detailGen.current) return;
          const url = URL.createObjectURL(region.blob);
          // Decode before swapping so sharpening never flashes an empty patch.
          const image = new Image();
          image.src = url;
          try {
            await image.decode();
          } catch {
            URL.revokeObjectURL(url);
            return;
          }
          if (generation !== detailGen.current) {
            URL.revokeObjectURL(url);
            return;
          }
          if (detailUrlRef.current) URL.revokeObjectURL(detailUrlRef.current);
          detailUrlRef.current = url;
          setDetail({
            src: url,
            // Store page coordinates: the previous sharp patch stays aligned
            // during zoom while its replacement is rendered at the new density.
            left: cssLeft / displayScale,
            top: cssTop / displayScale,
            width: cssW / displayScale,
            height: cssH / displayScale,
          });
        })
        .catch(() => undefined);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (!viewport.classList.contains("is-pinching")) {
        timer = window.setTimeout(paint, 50);
      }
    };
    const pause = () => {
      window.clearTimeout(timer);
      detailGen.current += 1;
    };
    schedule();
    viewport.addEventListener("scroll", schedule, { passive: true });
    viewport.addEventListener("reader-pinch-start", pause);
    viewport.addEventListener("reader-pinch-end", schedule);
    return () => {
      window.clearTimeout(timer);
      viewport.removeEventListener("scroll", schedule);
      viewport.removeEventListener("reader-pinch-start", pause);
      viewport.removeEventListener("reader-pinch-end", schedule);
      detailGen.current += 1;
    };
  }, [displayScale, dpr, needsDetail, pageIndex, session, viewportRef]);

  useEffect(
    () => () => {
      if (detailUrlRef.current) URL.revokeObjectURL(detailUrlRef.current);
    },
    [],
  );

  const width = page.width * displayScale;
  const height = page.height * displayScale;

  return (
    <article
      ref={pageRef}
      className={active ? "ps-reader-page is-active" : "ps-reader-page"}
      data-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1}`}
      style={{ width, height }}
    >
      <div
        className="ps-reader-page__surface"
      >
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="ps-reader-page__placeholder" aria-hidden="true">
            {renderError ? (
              <span>{renderError}</span>
            ) : (
              <span className="ps-reader-loader" />
            )}
          </div>
        )}
      </div>
      {needsDetail && detail ? (
        <img
          className="ps-reader-page__detail"
          src={detail.src}
          alt=""
          draggable={false}
          style={{
            left: detail.left * displayScale,
            top: detail.top * displayScale,
            width: detail.width * displayScale,
            height: detail.height * displayScale,
          }}
        />
      ) : null}
      <div
        ref={textLayerRef}
        className="textLayer ps-reader-text-layer"
        style={{
          width: page.width,
          height: page.height,
          transform: `scale(${displayScale})`,
        }}
      />
      <span className="ps-reader-page__number" aria-hidden="true">
        {pageIndex + 1}
      </span>
    </article>
  );
}

function markTextLayer(layer: PdfViewerTextLayer, query: string): void {
  layer.textDivs.forEach((element, index) => {
    const text = layer.textItems[index]?.toLocaleLowerCase() ?? "";
    element.classList.toggle(
      "is-search-hit",
      query.length >= 2 && text.includes(query),
    );
  });
}

type ReaderThumbnailProps = {
  session: PdfViewerSession;
  page: PdfViewerPage;
  pageIndex: number;
  active: boolean;
  onSelect: () => void;
};

function ReaderThumbnail({
  session,
  page,
  pageIndex,
  active,
  onSelect,
}: ReaderThumbnailProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;
    void session
      .renderPage(pageIndex, 180)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageIndex, session, src, visible]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      className={
        active ? "ps-reader-thumbnail is-active" : "ps-reader-thumbnail"
      }
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <span
        className="ps-reader-thumbnail__page"
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      >
        {src ? <img src={src} alt="" draggable={false} /> : null}
      </span>
      <span>{pageIndex + 1}</span>
    </button>
  );
}
