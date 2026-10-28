import {
  memo,
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
  Hash,
  Images,
  List,
  ListOrdered,
  Lock,
  Minimize2,
  Minus,
  MoreVertical,
  PanelLeft,
  Plus,
  Scissors,
  Search,
  Share2,
  Stamp,
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
import { viewerImageCaches } from "./viewerImageCache";

type ViewerProps = {
  recentId?: string;
};

type SidebarMode = "pages" | "outline" | null;

type SearchResult = {
  pageIndex: number;
  count: number;
};

// Zoom is relative to the page's printed size: 100% shows a PDF point
// (1/72 in) as 1/72 in of CSS length, like desktop PDF readers.
const CSS_PX_PER_PT = 96 / 72;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 100;
const ZOOM_FACTOR = 1.2;
// Browsers stop laying out boxes past ~17.9M CSS px (Firefox; Chromium allows
// ~33.5M), so the whole stacked document must fit under this at any zoom.
const MAX_STACK_CSS = 16_000_000;
const MAX_PAGE_CSS = 200_000;
const TILE_CSS = 768;
const DETAIL_MAX_PIXELS = 3_000_000;
const DETAIL_MAX_DIM = 1536;
const HUGE_PAGE_CSS = 1800;
const THUMBNAIL_WIDTH = 180;

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
  maxZoom: number;
  minZoom: number;
  pending: { mid: { x: number; y: number }; distance: number } | null;
};

/**
 * Shows the 10%–10,000% zoom range as 1–100%. The scale is logarithmic so
 * every 1% step magnifies by the same factor (~7%), wherever it starts.
 */
function zoomLabel(value: number): string {
  const span = Math.log(MAX_ZOOM / MIN_ZOOM);
  const position = Math.log(Math.max(MIN_ZOOM, value) / MIN_ZOOM) / span;
  return `${Math.max(1, Math.min(100, Math.round(1 + position * 99)))}%`;
}

function clampZoom(
  value: number,
  maxZoom = MAX_ZOOM,
  minZoom = MIN_ZOOM,
): number {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

/**
 * Index of the first stacked page whose bottom edge is at or below `clientY`.
 * A binary search keeps scroll and zoom handlers cheap on long documents.
 */
function pageIndexAtY(pages: HTMLElement, clientY: number): number {
  const items = pages.children;
  let low = 0;
  let high = items.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (items[mid]!.getBoundingClientRect().bottom < clientY) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low);
}

/** The page elements around `clientY`, nearest candidates first. */
function pagesNearY(viewport: HTMLElement, clientY: number): HTMLElement[] {
  const pages = viewport.querySelector<HTMLElement>(".ps-reader-pages");
  if (!pages || pages.children.length === 0) return [];
  const at = pageIndexAtY(pages, clientY);
  return [at, at - 1, at + 1].flatMap((index) => {
    const item = pages.children[index];
    return item instanceof HTMLElement && item.dataset.pageIndex != null
      ? [item]
      : [];
  });
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
  let nearest: { el: HTMLElement; dist: number } | null = null;
  for (const el of pagesNearY(viewport, clientY)) {
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
    pinch.maxZoom,
    pinch.minZoom,
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
  // While true, zoom tracks the "whole page on screen" level, including after
  // rotation; any manual zoom leaves fit mode until the zoom label is tapped.
  const [fitMode, setFitMode] = useState(true);
  const [viewportSize, setViewportSize] = useState({
    width: 420,
    height: 640,
    padX: 12,
    padY: 12,
  });
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
  // Tapping the page slides the header, toolbar and tool dock away to give
  // the page the whole screen; tapping again brings them back.
  const [chromeHidden, setChromeHidden] = useState(false);
  const fitWidthRef = useRef(0);
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
  const maxZoomRef = useRef(MAX_ZOOM);
  const minZoomRef = useRef(MIN_ZOOM);
  const fitModeRef = useRef(true);
  const activePageRef = useRef(0);

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
          // Each update re-renders the reader, so long documents report in
          // larger steps.
          const step = total > 200 ? 32 : 8;
          if (
            !cancelled &&
            (current === 1 || current % step === 0 || current === total)
          ) {
            setLoadingLabel(
              current < total
                ? `Search indexing: ${current} of ${total} pages`
                : "Search index ready",
            );
            if (opened) setIndexedPages([...opened.document.pages]);
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
      if (!entry) return;
      const pages = pagesRef.current;
      const style = pages ? window.getComputedStyle(pages) : null;
      const padX = style ? parseFloat(style.paddingLeft) || 0 : 12;
      const padY = style ? parseFloat(style.paddingTop) || 0 : 12;
      const widthChanged = entry.contentRect.width !== fitWidthRef.current;
      fitWidthRef.current = entry.contentRect.width;
      if (fitModeRef.current && widthChanged) {
        // Keep the current page's top in view when rotation re-fits it.
        // Height-only changes (the bars sliding away) leave the fit alone.
        const box = viewport.getBoundingClientRect();
        focalRef.current = {
          pageIndex: activePageRef.current,
          relX: 0.5,
          relY: 0,
          clientX: box.left + box.width / 2,
          clientY: box.top + padY,
        };
      }
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
        padX,
        padY,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [session, sidebar]);

  const updateActivePage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const center =
      viewport.getBoundingClientRect().top + viewport.clientHeight * 0.36;
    let closest = activePage;
    let distance = Number.POSITIVE_INFINITY;
    pagesNearY(viewport, center).forEach((page) => {
      const box = page.getBoundingClientRect();
      // The page under the reading line wins, even when zoomed in so far
      // that its top is far above the screen.
      const current =
        box.top <= center && box.bottom >= center
          ? -1
          : Math.min(Math.abs(box.top - center), Math.abs(box.bottom - center));
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

  const selectPage = useCallback(
    (pageIndex: number) => {
      goToPage(pageIndex);
      if (window.innerWidth < 760) setSidebar(null);
    },
    [goToPage],
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
      setFitMode(false);
      const next = clampZoom(
        zoomRef.current * factor,
        maxZoomRef.current,
        minZoomRef.current,
      );
      zoomRef.current = next;
      setZoom(next);
    },
    [rememberFocal],
  );

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      const box = viewport.getBoundingClientRect();
      rememberFocal(box.left + box.width / 2, box.top + box.height / 2);
    }
    setFitMode(true);
  }, [rememberFocal]);

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
        fitToScreen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fitToScreen, zoomAroundViewportCenter]);

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
  const maxPageHeight = useMemo(
    () => indexedPages.reduce((max, page) => Math.max(max, page.height), 1),
    [indexedPages],
  );
  const stackHeight = useMemo(
    () => indexedPages.reduce((sum, page) => sum + page.height, 0),
    [indexedPages],
  );
  // The zoom that makes the widest page span the screen edge to edge, in
  // portrait or landscape; taller pages scroll.
  const fitZoom = Math.max(
    0.01,
    (viewportSize.width - viewportSize.padX * 2) /
      (maxPageWidth * CSS_PX_PER_PT),
  );
  const minZoom = Math.min(MIN_ZOOM, fitZoom);
  const layoutMaxZoom = Math.max(
    minZoom,
    Math.min(
      MAX_ZOOM,
      MAX_STACK_CSS / Math.max(1, stackHeight * CSS_PX_PER_PT),
      MAX_PAGE_CSS / Math.max(1, maxPageWidth * CSS_PX_PER_PT),
      MAX_PAGE_CSS / Math.max(1, maxPageHeight * CSS_PX_PER_PT),
    ),
  );
  const effectiveZoom = clampZoom(zoom, layoutMaxZoom, minZoom);
  const displayScale = effectiveZoom * CSS_PX_PER_PT;

  useLayoutEffect(() => {
    maxZoomRef.current = layoutMaxZoom;
    minZoomRef.current = minZoom;
  }, [layoutMaxZoom, minZoom]);

  useLayoutEffect(() => {
    fitModeRef.current = fitMode;
    if (!fitMode) return;
    zoomRef.current = fitZoom;
    setZoom(fitZoom);
  }, [fitMode, fitZoom]);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  // zoomRef is the live zoom: wheel and pinch move it between renders, so
  // every write keeps it current rather than copying `zoom` back after a
  // commit, which raced fast wheel events and made zoom stall and jitter.
  useEffect(() => {
    const next = clampZoom(zoomRef.current, layoutMaxZoom, minZoom);
    zoomRef.current = next;
    setZoom(next);
  }, [layoutMaxZoom, minZoom]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const focal = focalRef.current;
    if (!viewport || !focal || pinchRef.current) return;
    applyZoomFocal(viewport, focal);
    // A focal belongs to one zoom change; reapplying it later (when indexing
    // refines page sizes, say) would yank the reader back to an old spot.
    focalRef.current = null;
  }, [displayScale, viewportSize]);

  // Base page images are sized for the fitted view; zooming past it is
  // sharpened by viewport tiles, so this only changes on resize or rotation.
  const paintWidth = Math.min(
    session && session.document.pageCount > 24 ? 1280 : 2048,
    Math.max(
      512,
      Math.ceil(
        (maxPageWidth *
          fitZoom *
          CSS_PX_PER_PT *
          Math.min(window.devicePixelRatio || 1, 2)) /
          256,
      ) * 256,
    ),
  );
  const highZoom = effectiveZoom > fitZoom * 1.2;

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
          pinch.maxZoom,
          pinch.minZoom,
        );
        pinch.lastMid = pinch.pending.mid;
        pinch.pending = null;
      }
      const focal: ZoomFocal = {
        pageIndex: pinch.pageIndex,
        relX: pinch.relX,
        relY: pinch.relY,
        clientX: pinch.lastMid.x,
        clientY: pinch.lastMid.y,
      };
      focalRef.current = focal;
      clearLivePinchTransform(pages);
      writeZoomLabel(pinch.lastZoom);
      zoomRef.current = pinch.lastZoom;
      flushSync(() => {
        setFitMode(false);
        setZoom(pinch.lastZoom);
      });
      applyZoomFocal(viewport, focal);
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
        maxZoom: maxZoomRef.current,
        minZoom: minZoomRef.current,
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
        maxZoomRef.current,
        minZoomRef.current,
      );
      zoomRef.current = next;
      writeZoomLabel(next);
      if (wheelRafRef.current) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        wheelRafRef.current = 0;
        setFitMode(false);
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
    <div
      className={
        chromeHidden && !searchOpen && sidebar === null && !moreOpen
          ? "ps-screen ps-screen--viewer is-chrome-hidden"
          : "ps-screen ps-screen--viewer"
      }
      aria-label="Reader"
      onFocusCapture={(event) => {
        // Keyboard focus moving into a hidden bar brings the bars back.
        if (!viewportRef.current?.contains(event.target as Node))
          setChromeHidden(false);
      }}
    >
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
          <div className="ps-row">
            <AnimatedButton type="submit" disabled={!password}>
              Open PDF
            </AnimatedButton>
            <AnimatedButton variant="ghost" onClick={() => navigate(backHash)}>
              Cancel
            </AnimatedButton>
          </div>
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
                disabled={effectiveZoom <= minZoom}
                onClick={() => zoomAroundViewportCenter(1 / ZOOM_FACTOR)}
              >
                <Minus size={17} />
              </ReaderIconButton>
              <button
                ref={zoomLabelRef}
                type="button"
                className="ps-reader-zoom__value"
                aria-label="Fit page to screen"
                title="Fit page to screen"
                onClick={fitToScreen}
              >
                {zoomLabel(effectiveZoom)}
              </button>
              <ReaderIconButton
                label="Zoom in"
                disabled={effectiveZoom >= layoutMaxZoom}
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
                        onSelect={selectPage}
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

            <div
              ref={viewportRef}
              className="ps-reader-viewport"
              onClick={(event) => {
                // A plain tap on the page toggles the bars; finishing a text
                // selection does not.
                if (event.detail > 1) return;
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) return;
                setChromeHidden((hidden) => !hidden);
              }}
            >
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
                    highZoom={highZoom}
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openTool("split")}
                  >
                    <Scissors size={16} strokeWidth={2.1} aria-hidden="true" />
                    Split PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openTool("watermark")}
                  >
                    <Stamp size={16} strokeWidth={2.1} aria-hidden="true" />
                    Watermark
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openTool("numbers")}
                  >
                    <Hash size={16} strokeWidth={2.1} aria-hidden="true" />
                    Page numbers
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openTool("pdf-images")}
                  >
                    <Images size={16} strokeWidth={2.1} aria-hidden="true" />
                    PDF to Images
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
  highZoom: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
};

type PageDetail = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  key: string;
};

// Memoized: indexing and the active-page highlight change props for only a
// few pages at a time, so long documents don't re-render every page.
const ReaderPage = memo(function ReaderPage({
  session,
  page,
  pageIndex,
  displayScale,
  renderWidth,
  query,
  active,
  highZoom,
  viewportRef,
}: ReaderPageProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderedTextRef = useRef<PdfViewerTextLayer | null>(null);
  const queryRef = useRef(query);
  const imageCache = viewerImageCaches(session).pages;
  const [tiles, setTiles] = useState<PageDetail[]>([]);
  const tileUrlsRef = useRef<Map<string, string>>(new Map());
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
      {
        root: viewportRef.current,
        rootMargin: highZoom ? "160px 0px" : "1400px 0px",
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [highZoom, viewportRef]);

  // A fast fling passes many pages; only start text work for pages that stay.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setSettled(true), 180);
    return () => {
      window.clearTimeout(timer);
      setSettled(false);
    };
  }, [visible]);

  // Off-screen pages stay cached until the bounded cache needs room, then
  // drop their image so long documents don't keep every page decoded.
  useEffect(() => {
    imageCache.setVisible(pageIndex, visible);
  }, [imageCache, pageIndex, visible]);

  useEffect(() => () => imageCache.remove(pageIndex), [imageCache, pageIndex]);

  useEffect(() => {
    if (!visible) return;
    if (src && imageCache.lookup(pageIndex, renderWidth) === src) return;
    let cancelled = false;
    const controller = new AbortController();
    void session
      .renderPage(pageIndex, renderWidth, controller.signal)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        imageCache.set(pageIndex, url, renderWidth, () =>
          setSrc((current) => (current === url ? null : current)),
        );
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
      controller.abort();
    };
  }, [imageCache, pageIndex, renderWidth, session, src, visible]);

  useEffect(() => {
    if (!settled || !textLayerRef.current || !page.text) return;
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
  }, [page.text, pageIndex, session, settled]);

  useEffect(() => {
    if (renderedTextRef.current) markTextLayer(renderedTextRef.current, query);
  }, [query]);

  const dpr = Math.min(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    2.5,
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
    let batch: AbortController | null = null;
    const paint = () => {
      if (viewport.classList.contains("is-pinching")) return;
      const pageBox = pageEl.getBoundingClientRect();
      const viewBox = viewport.getBoundingClientRect();
      const pad = 48;
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
      if (cssRight - cssLeft < 8 || cssBottom - cssTop < 8) return;
      // Tile clips are derived from the exact display scale. Reusing a tile
      // from a nearby rounded scale shifts its PDF-space clip even when its
      // CSS tile coordinates are unchanged, so the raster cache key must use
      // the exact scale and output density as well.
      const rasterKey = `${displayScale}:${dpr}`;
      const startX = Math.floor(cssLeft / TILE_CSS);
      const startY = Math.floor(cssTop / TILE_CSS);
      const endX = Math.floor((cssRight - 1) / TILE_CSS);
      const endY = Math.floor((cssBottom - 1) / TILE_CSS);
      const jobs: PageDetail[] = [];
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          const left = tx * TILE_CSS;
          const top = ty * TILE_CSS;
          const width = Math.min(TILE_CSS, pageBox.width - left);
          const height = Math.min(TILE_CSS, pageBox.height - top);
          if (width < 8 || height < 8) continue;
          jobs.push({
            src: "",
            key: `${rasterKey}:${tx}:${ty}`,
            left: left / displayScale,
            top: top / displayScale,
            width: width / displayScale,
            height: height / displayScale,
          });
        }
      }
      if (jobs.length === 0) return;
      const generation = ++detailGen.current;
      // Tiles for a spot the reader already scrolled past are dropped from
      // the paint queue rather than rendered and thrown away.
      batch?.abort();
      batch = new AbortController();
      const signal = batch.signal;
      void Promise.allSettled(
        jobs.map(async (job) => {
          const cached = tileUrlsRef.current.get(job.key);
          if (cached) return { ...job, src: cached };
          let outW = Math.max(1, Math.round(job.width * displayScale * dpr));
          let outH = Math.max(1, Math.round(job.height * displayScale * dpr));
          const fit = Math.min(
            1,
            DETAIL_MAX_DIM / outW,
            DETAIL_MAX_DIM / outH,
            Math.sqrt(DETAIL_MAX_PIXELS / Math.max(1, outW * outH)),
          );
          outW = Math.max(1, Math.round(outW * fit));
          outH = Math.max(1, Math.round(outH * fit));
          const region: PdfViewerPageRegion = await session.renderPageRegion(
            pageIndex,
            {
              x: job.left,
              y: job.top,
              width: job.width,
              height: job.height,
            },
            outW,
            outH,
            signal,
          );
          const url = URL.createObjectURL(region.blob);
          const image = new Image();
          image.src = url;
          try {
            await image.decode();
          } catch {
            URL.revokeObjectURL(url);
            throw new Error("Could not decode this page tile.");
          }
          return { ...job, src: url };
        }),
      )
        .then((results) => {
          const next = results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : [],
          );
          // A failed tile drops the whole batch; revoke the tiles it already
          // rendered so they don't leak.
          if (
            generation !== detailGen.current ||
            next.length !== results.length
          ) {
            next.forEach((tile) => {
              if (!tileUrlsRef.current.has(tile.key))
                URL.revokeObjectURL(tile.src);
            });
            return;
          }
          const keep = new Set(next.map((tile) => tile.key));
          tileUrlsRef.current.forEach((url, key) => {
            if (!keep.has(key)) {
              URL.revokeObjectURL(url);
              tileUrlsRef.current.delete(key);
            }
          });
          next.forEach((tile) => tileUrlsRef.current.set(tile.key, tile.src));
          setTiles(next);
        })
        .catch(() => undefined);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      if (!viewport.classList.contains("is-pinching")) {
        timer = window.setTimeout(paint, 70);
      }
    };
    const pause = () => {
      window.clearTimeout(timer);
      batch?.abort();
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
      batch?.abort();
      detailGen.current += 1;
    };
  }, [displayScale, dpr, needsDetail, pageIndex, session, viewportRef]);

  useEffect(() => {
    if (needsDetail) return;
    tileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    tileUrlsRef.current.clear();
    setTiles([]);
  }, [needsDetail]);

  useEffect(
    () => () => {
      tileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      tileUrlsRef.current.clear();
    },
    [],
  );

  const width = page.width * displayScale;
  const height = page.height * displayScale;
  const layoutHuge = width > HUGE_PAGE_CSS || height > HUGE_PAGE_CSS;
  const showBase = Boolean(src) && (!layoutHuge || tiles.length === 0);

  return (
    <article
      ref={pageRef}
      className={active ? "ps-reader-page is-active" : "ps-reader-page"}
      data-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1}`}
      style={{
        width,
        height,
        containIntrinsicSize: `${width}px ${height}px`,
      }}
    >
      <div
        className="ps-reader-page__surface"
      >
        {showBase ? (
          <img
            src={src!}
            alt=""
            draggable={false}
            decoding="async"
          />
        ) : src || tiles.length > 0 ? null : (
          <div className="ps-reader-page__placeholder" aria-hidden="true">
            {renderError ? (
              <span>{renderError}</span>
            ) : (
              <span className="ps-reader-loader" />
            )}
          </div>
        )}
      </div>
      {needsDetail
        ? tiles.map((tile) => (
            <img
              key={tile.key}
              className="ps-reader-page__detail"
              src={tile.src}
              alt=""
              draggable={false}
              style={{
                left: tile.left * displayScale,
                top: tile.top * displayScale,
                width: tile.width * displayScale,
                height: tile.height * displayScale,
              }}
            />
          ))
        : null}
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
});

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
  onSelect: (pageIndex: number) => void;
};

const ReaderThumbnail = memo(function ReaderThumbnail({
  session,
  page,
  pageIndex,
  active,
  onSelect,
}: ReaderThumbnailProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const imageCache = viewerImageCaches(session).thumbnails;

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting === true);
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    imageCache.setVisible(pageIndex, visible);
  }, [imageCache, pageIndex, visible]);

  useEffect(() => () => imageCache.remove(pageIndex), [imageCache, pageIndex]);

  useEffect(() => {
    if (!visible) return;
    if (src && imageCache.lookup(pageIndex, THUMBNAIL_WIDTH) === src) return;
    let cancelled = false;
    const controller = new AbortController();
    void session
      .renderPage(pageIndex, THUMBNAIL_WIDTH, controller.signal)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        imageCache.set(pageIndex, url, THUMBNAIL_WIDTH, () =>
          setSrc((current) => (current === url ? null : current)),
        );
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [imageCache, pageIndex, session, src, visible]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={
        active ? "ps-reader-thumbnail is-active" : "ps-reader-thumbnail"
      }
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(pageIndex)}
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
});
