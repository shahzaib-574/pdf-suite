import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  List,
  Minus,
  PanelLeft,
  Plus,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { AnimatedButton, PageHeader } from '../components';
import type { PickedFile } from '../lib/types';
import { engine } from '../pdf';
import type {
  PdfViewerPage,
  PdfViewerSession,
  PdfViewerTextLayer,
} from '../pdf/render';
import { saveBytes, shareOrDownload } from '../store/files';
import {
  currentViewerBytes,
  currentViewerName,
  lastJob,
} from '../store/lastJob';
import { getRecent } from '../store/recents';
import { useTheme } from '../theme/context';
import { navigate } from './nav';

type ViewerProps = {
  recentId?: string;
};

type SidebarMode = 'pages' | 'outline' | null;

type SearchResult = {
  pageIndex: number;
  count: number;
};

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.5;

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

function touchDistance(event: ReactTouchEvent): number {
  const first = event.touches[0];
  const second = event.touches[1];
  if (!first || !second) return 0;
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function Viewer({ recentId }: ViewerProps) {
  const { reducedMotion } = useTheme();
  const [name, setName] = useState('document.pdf');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [session, setSession] = useState<PdfViewerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState('Opening document…');
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(420);
  const [sidebar, setSidebar] = useState<SidebarMode>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchCursor, setSearchCursor] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<'save' | 'share' | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const backHash = recentId ? '#/recents' : lastJob.result ? '#/result' : '#/';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (recentId) {
        const item = await getRecent(recentId);
        if (cancelled) return;
        if (!item) {
          setError('File not found.');
          return;
        }
        setName(item.name);
        if (item.bytes.byteLength === 0) {
          setError('Preview is unavailable for this file because it was too large to retain.');
          return;
        }
        setBytes(item.bytes);
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
      setError('Nothing to open.');
    })();
    return () => {
      cancelled = true;
    };
  }, [recentId]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    let opened: PdfViewerSession | null = null;
    const file: PickedFile = { name, mime: 'application/pdf', bytes };
    void engine
      .openViewer(file, (current, total) => {
        if (!cancelled) setLoadingLabel(`Indexing page ${current} of ${total}…`);
      })
      .then((viewer) => {
        opened = viewer;
        if (cancelled) {
          void viewer.destroy();
          return;
        }
        setSession(viewer);
        setActivePage(0);
        setLoadingLabel('Opening document…');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not open PDF');
        }
      });
    return () => {
      cancelled = true;
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
    const center = viewport.getBoundingClientRect().top + viewport.clientHeight * 0.36;
    const pages = viewport.querySelectorAll<HTMLElement>('[data-page-index]');
    let closest = activePage;
    let distance = Number.POSITIVE_INFINITY;
    pages.forEach((page) => {
      const box = page.getBoundingClientRect();
      const current = Math.abs(box.top + Math.min(box.height * 0.2, 100) - center);
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
    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (scrollFrameRef.current != null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [session, updateActivePage]);

  const goToPage = useCallback((pageIndex: number, smooth = true) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounded = Math.max(
      0,
      Math.min(session?.document.pageCount ? session.document.pageCount - 1 : 0, pageIndex),
    );
    const page = viewport.querySelector<HTMLElement>(`[data-page-index="${bounded}"]`);
    page?.scrollIntoView({
      behavior: smooth && !reducedMotion ? 'smooth' : 'auto',
      block: 'start',
    });
    setActivePage(bounded);
  }, [reducedMotion, session]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if (event.key === '+' || event.key === '=') {
        setZoom((value) => clampZoom(value + 0.15));
      } else if (event.key === '-') {
        setZoom((value) => clampZoom(value - 0.15));
      } else if (event.key === '0') {
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchInputRef.current?.focus(), 40);
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!session || normalizedQuery.length < 2) return [];
    return session.document.pages.flatMap((page, pageIndex) => {
      const lower = page.text.toLocaleLowerCase();
      const count = occurrences(lower, normalizedQuery);
      return count > 0
        ? [{ pageIndex, count }]
        : [];
    });
  }, [normalizedQuery, session]);
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

  async function onShare(): Promise<void> {
    if (!bytes) return;
    setMessage(null);
    setActiveExport('share');
    try {
      const result = await shareOrDownload(bytes, name, 'application/pdf');
      if (result.status === 'cancelled') return;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not share this PDF');
    } finally {
      setActiveExport(null);
    }
  }

  async function onSave(): Promise<void> {
    if (!bytes) return;
    setMessage(null);
    setActiveExport('save');
    try {
      const result = await saveBytes(bytes, name, 'application/pdf');
      if (result.status === 'cancelled') return;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save this PDF');
    } finally {
      setActiveExport(null);
    }
  }

  const maxPageWidth = useMemo(
    () => Math.max(1, ...(session?.document.pages.map((page) => page.width) ?? [1])),
    [session],
  );
  const pageGutter = viewportWidth < 620 ? 24 : 52;
  const fitScale = Math.max(0.1, (viewportWidth - pageGutter) / maxPageWidth);
  const displayScale = fitScale * zoom;
  const renderWidth = Math.min(
    1800,
    Math.max(900, (viewportWidth - pageGutter) * Math.min(window.devicePixelRatio || 1, 2.5)),
  );

  function onTouchStart(event: ReactTouchEvent<HTMLDivElement>): void {
    if (event.touches.length !== 2) return;
    pinchRef.current = { distance: touchDistance(event), zoom };
  }

  function onTouchMove(event: ReactTouchEvent<HTMLDivElement>): void {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || pinch.distance <= 0) return;
    event.preventDefault();
    setZoom(clampZoom(pinch.zoom * (touchDistance(event) / pinch.distance)));
  }

  function onTouchEnd(event: ReactTouchEvent<HTMLDivElement>): void {
    if (event.touches.length < 2) pinchRef.current = null;
  }

  const emptyCopy = recentId
    ? {
        title: 'Preview unavailable',
        body:
          error === 'File not found.'
            ? 'That recent file is no longer on this device.'
            : error === 'Nothing to open.'
              ? 'Choose a PDF from Recents or Tools to read it here.'
              : error ?? 'This file is too large to keep in Recents.',
        action: 'Back to Recents',
        href: '#/recents',
      }
    : error === 'Nothing to open.'
      ? {
          title: 'No PDF open',
          body: 'Choose a PDF from Tools or Recents to read it here.',
          action: 'Browse tools',
          href: '#/',
        }
      : {
          title: 'Could not open PDF',
          body: error ?? 'Choose another file and try again.',
          action: 'Browse tools',
          href: '#/',
        };

  return (
    <div className="ps-screen ps-screen--viewer">
      <PageHeader
        title="Reader"
        subtitle={error ? undefined : name}
        onBack={() => navigate(backHash)}
      />
      {error ? (
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
          <div className="ps-reader-toolbar" aria-label="Reader controls">
            <div className="ps-reader-toolbar__group">
              <ReaderIconButton
                label={sidebar ? 'Close navigation panel' : 'Show page navigation'}
                active={sidebar !== null}
                onClick={() => setSidebar((value) => (value ? null : 'pages'))}
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
                onClick={() => setZoom((value) => clampZoom(value - 0.15))}
              >
                <Minus size={17} />
              </ReaderIconButton>
              <button
                type="button"
                className="ps-reader-zoom__value"
                aria-label="Fit pages to width"
                title="Fit to width"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <ReaderIconButton
                label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((value) => clampZoom(value + 0.15))}
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
                label={activeExport === 'share' ? 'Sharing PDF' : 'Share PDF'}
                disabled={activeExport !== null}
                onClick={() => void onShare()}
              >
                <Share2 size={18} />
              </ReaderIconButton>
              <ReaderIconButton
                label={activeExport === 'save' ? 'Saving PDF' : 'Save PDF'}
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
                  if (event.key === 'Enter') moveSearch(event.shiftKey ? -1 : 1);
                }}
              />
              <span className="ps-reader-search__count" aria-live="polite">
                {normalizedQuery.length < 2
                  ? 'Type 2+ letters'
                  : totalMatches > 0
                    ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'}`
                    : 'No matches'}
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
              <ReaderIconButton label="Close search" onClick={() => setSearchOpen(false)}>
                <X size={17} />
              </ReaderIconButton>
            </div>
          ) : null}

          {message ? <p className="ps-reader-message" role="status">{message}</p> : null}

          <div className="ps-reader-workspace">
            {sidebar ? (
              <aside className="ps-reader-sidebar" aria-label="Document navigation">
                <div className="ps-reader-sidebar__tabs">
                  <button
                    type="button"
                    className={sidebar === 'pages' ? 'is-active' : ''}
                    onClick={() => setSidebar('pages')}
                  >
                    <List size={16} /> Pages
                  </button>
                  <button
                    type="button"
                    className={sidebar === 'outline' ? 'is-active' : ''}
                    onClick={() => setSidebar('outline')}
                  >
                    <Bookmark size={16} /> Outline
                  </button>
                </div>
                {sidebar === 'pages' ? (
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
                  <nav className="ps-reader-outline" aria-label="Document outline">
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
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              <div className="ps-reader-pages">
                {session.document.pages.map((page, pageIndex) => (
                  <ReaderPage
                    key={pageIndex}
                    session={session}
                    page={page}
                    pageIndex={pageIndex}
                    displayScale={displayScale}
                    renderWidth={renderWidth}
                    query={normalizedQuery}
                    active={activePage === pageIndex}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="ps-reader-mobile-status" aria-hidden="true">
            <span>Page {activePage + 1} of {session.document.pageCount}</span>
            <ChevronDown size={14} />
            <span>Pinch to zoom · Drag to pan</span>
          </div>
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
      className={active ? 'ps-reader-icon-button is-active' : 'ps-reader-icon-button'}
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
};

function ReaderPage({
  session,
  page,
  pageIndex,
  displayScale,
  renderWidth,
  query,
  active,
}: ReaderPageProps) {
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderedTextRef = useRef<PdfViewerTextLayer | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    const element = pageRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const nearViewport = entry?.isIntersecting === true;
        setVisible(nearViewport);
        if (!nearViewport && objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
          setSrc(null);
        }
      },
      { rootMargin: '900px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;
    void session
      .renderPage(pageIndex, renderWidth)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setSrc(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Could not render this page');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageIndex, renderWidth, session, src, visible]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

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

  const width = page.width * displayScale;
  const height = page.height * displayScale;

  return (
    <article
      ref={pageRef}
      className={active ? 'ps-reader-page is-active' : 'ps-reader-page'}
      data-page-index={pageIndex}
      aria-label={`Page ${pageIndex + 1}`}
      style={{ width, height }}
    >
      <div
        className="ps-reader-page__surface"
        style={{
          width: page.width,
          height: page.height,
          transform: `scale(${displayScale})`,
        }}
      >
        {src ? (
          <img src={src} alt="" draggable={false} style={{ width: page.width, height: page.height }} />
        ) : (
          <div className="ps-reader-page__placeholder" aria-hidden="true">
            {renderError ? <span>{renderError}</span> : <span className="ps-reader-loader" />}
          </div>
        )}
        <div ref={textLayerRef} className="textLayer ps-reader-text-layer" />
      </div>
      <span className="ps-reader-page__number" aria-hidden="true">{pageIndex + 1}</span>
    </article>
  );
}

function markTextLayer(layer: PdfViewerTextLayer, query: string): void {
  layer.textDivs.forEach((element, index) => {
    const text = layer.textItems[index]?.toLocaleLowerCase() ?? '';
    element.classList.toggle('is-search-hit', query.length >= 2 && text.includes(query));
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
      { rootMargin: '500px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) return;
    let cancelled = false;
    void session.renderPage(pageIndex, 180).then((blob) => {
      const url = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrlRef.current = url;
      setSrc(url);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageIndex, session, src, visible]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={active ? 'ps-reader-thumbnail is-active' : 'ps-reader-thumbnail'}
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={active ? 'page' : undefined}
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
