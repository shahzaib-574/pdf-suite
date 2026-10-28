import { useCallback, useEffect, useLayoutEffect, useState, useRef } from "react";
import "./motion/gsapSetup";
import { BottomNav, type BottomNavTab } from "./components";
import { toolById } from "./lib/catalog";
import type { Route, PickedFile, ToolId } from "./lib/types";
import { subscribeIncoming } from "./store/incoming";
import { queueToolFiles } from "./store/toolInput";
import { beginViewerImport, setCurrentViewer, setLastJob } from "./store/lastJob";
import { navigate, goBack, replaceWith } from "./screens/nav";
import { installAppBack, useBackHandler } from "./screens/back";
import { AnimatedButton } from "./components";
import { Home } from "./screens/Home";
import { Recents } from "./screens/Recents";
import { Search } from "./screens/Search";
import { Result } from "./screens/Result";
import { Settings } from "./screens/Settings";
import { ToolFlow } from "./screens/ToolFlow";
import { Viewer } from "./screens/Viewer";
import { parseHash } from "./screens/nav";
import "./screens/screens.css";
import { pruneStagedNativeExports, MAX_INPUT_BYTES } from "./store/files";
import { retainIncoming } from "./store/recents";
import { ThemeProvider } from "./theme/ThemeProvider";
import { markUpdateReady } from "./store/updates";
import { Capacitor } from "@capacitor/core";
import { useWebLayout } from './web/platform';
import { WebFooter, WebHeader, WebHome, WebNavProvider } from './web/WebHome';
import './web/website.css';
import { initializeMobileAds, retireMobileBanners, markBannerCleanupFailed } from './ads/admob';
import { shouldShowToolsBanner } from './ads/policy';
import { nativeDocumentCameraAvailable } from './store/documentCamera';
import type { NativeScanAdapter } from './screens/ScanCamera';
import { loadScanDraft } from './store/scanDraft';

export default function App() {
  return <AppView nativeScan={nativeDocumentCameraAvailable() ? {} : undefined} />;
}

type ScanPresentation = 'pending' | 'explicit' | 'ready';
type ScanOrigin = {route: Route; revision: number; hash: string; scroll: number; focus: HTMLElement | null};
/** Internal real application view; the shipping wrapper selects only the native adapter. */
export function AppView({nativeScan, loadNativeScanDraft}: {
  nativeScan?: NativeScanAdapter;
  loadNativeScanDraft?: typeof loadScanDraft;
}) {
  // The website shows its web header, home and footer only on wide screens;
  // at phone width it is the app (bottom nav, app home).
  const webLayout = useWebLayout();
  useEffect(() => { document.getElementById('app-boot')?.remove(); }, []);
  useEffect(() => {
    void initializeMobileAds();
    return () => { void retireMobileBanners().catch(markBannerCleanupFailed); };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void markUpdateReady(); });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [inputRevision, setInputRevision] = useState(0);
  const [incoming, setIncoming] = useState<PickedFile[]>([]);
  const incomingRef = useRef<PickedFile[]>([]);
  const openingPdf = useRef<ReturnType<typeof beginViewerImport> | null>(null);
  const [importError, setImportError] = useState("");
  useEffect(
    () =>
      subscribeIncoming((files) => {
        const combined = openingPdf.current ? files : [...incomingRef.current, ...files];
        if (
          combined.length > 200 ||
          combined.reduce((sum, f) => sum + f.bytes.length, 0) > MAX_INPUT_BYTES
        ) {
          const message="Shared files exceed 200 files or 128 MB. Use or dismiss the current group, then share the new files again.";
          if(openingPdf.current){openingPdf.current.reject(new Error(message));openingPdf.current=null;}
          else setImportError(message);
          return;
        }
        void retainIncoming(combined);
        const file = combined[0];
        if (
          combined.length === 1 && file &&
          (file.mime.toLowerCase() === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf"))
        ) {
          // An external PDF is an open request, not a tool-selection request.
          // Clear the previous result because Viewer otherwise prefers its bytes.
          setLastJob(null, null);
          if(openingPdf.current) {
            openingPdf.current.resolve(file);openingPdf.current=null;
            incomingRef.current=[];setIncoming([]);setImportError('');
            return;
          }
          setCurrentViewer(file.bytes, file.name);
          incomingRef.current = [];
          setIncoming([]);
          setImportError("");
          navigate("#/viewer");
          // A second external PDF must reload an already-open reader too.
          setInputRevision((revision) => revision + 1);
          return;
        }
        incomingRef.current = combined;
        setIncoming(combined);
      }, message=>{
        if(openingPdf.current){openingPdf.current.reject(new Error(message));openingPdf.current=null;}
        else setImportError(message);
      }, ()=>{
        if(openingPdf.current)return;
        setLastJob(null,null);openingPdf.current=beginViewerImport();
        setImportError('');navigate('#/viewer');setInputRevision(revision=>revision+1);
      }),
    [],
  );
  function openIncoming(tool: ToolId, files: PickedFile[]) {
    queueToolFiles(tool, files);
    incomingRef.current = [];
    setIncoming([]);
    setImportError("");
    navigate(`#/tool/${tool}`);
    setInputRevision((revision) => revision + 1);
  }
  const [route, setRoute] = useState<Route>(() =>
    parseHash(window.location.hash),
  );
  const routeRef = useRef(route);
  useLayoutEffect(() => { routeRef.current = route; }, [route]);
  const [scanOrigin, setScanOrigin] = useState<ScanOrigin | null>(() =>
    nativeScan && route.name === 'tool' && route.id === 'scan'
      ? {route: {name:'home'}, revision: inputRevision, hash:'#/', scroll:0, focus:null} : null,
  );
  const originRef = useRef(scanOrigin);
  useLayoutEffect(() => { originRef.current = scanOrigin; }, [scanOrigin]);
  const [scanPresentation, setScanPresentation] = useState<ScanPresentation>('pending');
  const restoreOrigin = useRef<ScanOrigin | null>(null);
  const closeEmptyScan = useCallback(() => {
    if (routeRef.current.name !== 'tool' || routeRef.current.id !== 'scan') return;
    if (originRef.current && Number(window.history.state?.reamDepth ?? 0) > 0) goBack(originRef.current.hash);
    else if (originRef.current) replaceWith(originRef.current.hash);
    else replaceWith('#/');
  }, []);
  const presentScan = useCallback((next: ScanPresentation) => {
    if (routeRef.current.name !== 'tool' || routeRef.current.id !== 'scan') return;
    setScanPresentation(next);
    if (next === 'ready') setScanOrigin(null);
  }, []);
  useBackHandler(() => {
    if (!originRef.current || scanPresentation !== 'pending') return false;
    closeEmptyScan();
    return true;
  });
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = parseHash(window.location.hash);
      const previous = routeRef.current;
      // A history traversal emits both popstate and hashchange; restore only once.
      if (event.isTrusted && routeHash(next) === routeHash(previous)) return;
      if (nativeScan && next.name === 'tool' && next.id === 'scan' &&
          !(previous.name === 'tool' && previous.id === 'scan')) {
        setScanOrigin({route:previous, revision:inputRevision,
          hash:routeHash(previous), scroll:window.scrollY,
          focus:document.activeElement instanceof HTMLElement ? document.activeElement : null});
        setScanPresentation('pending');
      } else if (!(next.name === 'tool' && next.id === 'scan')) {
        if (originRef.current && window.location.hash === originRef.current.hash)
          restoreOrigin.current = originRef.current;
        setScanOrigin(null);
      }
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, [nativeScan, inputRevision]);

  const pendingOrigin = !!scanOrigin && scanPresentation === 'pending';
  const visibleRoute = pendingOrigin ? scanOrigin.route : route;

  useEffect(() => installAppBack(), []);

  useEffect(() => {
    void pruneStagedNativeExports();
  }, []);


  useLayoutEffect(() => {
    document.title = webLayout && visibleRoute.name === 'home' ? 'Ream PDF Suite \u2014 Free PDF tools in your browser' : `${routeTitle(visibleRoute)} \u00b7 Ream`;
    if (pendingOrigin && scanOrigin) {
      window.scrollTo(0, scanOrigin.scroll);
      return;
    }
    if (restoreOrigin.current) {
      const origin = restoreOrigin.current;
      restoreOrigin.current = null;
      window.scrollTo(0, origin.scroll);
      const savedLabel = origin.focus?.getAttribute('aria-label');
      const fallback = savedLabel
        ? Array.from(document.querySelectorAll<HTMLElement>('#primary-navigation button')).find(button => button.getAttribute('aria-label') === savedLabel)
        : undefined;
      const focus = origin.focus?.isConnected ? origin.focus : fallback ?? document.querySelector<HTMLElement>('.route-stage > div:not([hidden]) h1');
      if (focus) {
        if (focus.tagName === 'H1') focus.setAttribute('tabindex', '-1');
        focus.focus({preventScroll:true});
      }
      return;
    }
    window.scrollTo(0, 0);
    const heading = document.querySelector<HTMLElement>(".route-stage > div:not([hidden]) h1");
    if (heading && !(document.activeElement instanceof HTMLInputElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [visibleRoute, pendingOrigin, scanOrigin, webLayout]);


  return (
    <ThemeProvider>
      <WebNavProvider>
      {webLayout ? <WebHeader /> : null}
      {Capacitor.isNativePlatform() ||
      window.matchMedia("(hover: none) and (pointer: coarse)").matches ? null : (
        <button
          type="button"
          hidden={
            (route.name === "tool" && route.id === "scan") ||
            route.name === "viewer"
          }
          className="skip-to-nav"
          onClick={() => {
            document
              .querySelector<HTMLButtonElement>(
                "#primary-navigation button:not(:disabled)",
              )
              ?.focus();
          }}
        >
          Skip to primary navigation
        </button>
      )}
      <div inert={nativeScan && route.name === 'tool' && route.id === 'scan' && scanPresentation === 'pending' ? true : undefined} onKeyDownCapture={event => {
        // Inert prevents DOM actions, not retained-page window shortcut listeners.
        if (nativeScan && route.name === 'tool' && route.id === 'scan' && scanPresentation !== 'ready')
          event.stopPropagation();
      }} className={`app-frame${(visibleRoute.name === "tool" && visibleRoute.id === "scan") || visibleRoute.name === "viewer" ? " app-frame--scan" : ""}`}>
        {importError ? (
          <div className="ps-banner ps-banner--error ps-row" role="alert">
            <span>{importError}</span>
            <AnimatedButton
              variant="ghost"
              onClick={() => setImportError("")}
            >
              Dismiss
            </AnimatedButton>
          </div>
        ) : null}
        {incoming.length ? (
          <section className="ps-incoming" aria-label="Received files">
            <h2>
              {incoming.length} shared file{incoming.length === 1 ? "" : "s"}{" "}
              ready
            </h2>
            <p>Choose how to use these files.</p>
            <div className="ps-row">
              {incoming.every((f) => f.mime === "application/pdf") ? (
                <>
                  <AnimatedButton
                    onClick={() =>
                      openIncoming(
                        incoming.length > 1 ? "merge" : "view",
                        incoming,
                      )
                    }
                  >
                    {incoming.length > 1 ? "Merge PDFs" : "Open PDF"}
                  </AnimatedButton>
                  {incoming.length === 1 ? (
                    <AnimatedButton
                      variant="ghost"
                      onClick={() => openIncoming("pdf-docx", incoming)}
                    >
                      Convert to Word
                    </AnimatedButton>
                  ) : null}
                </>
              ) : incoming.every((f) => f.mime.startsWith("image/")) ? (
                <AnimatedButton onClick={() => openIncoming("scan", incoming)}>
                  Review images
                </AnimatedButton>
              ) : incoming.length === 1 &&
                incoming[0]!.name.toLowerCase().endsWith(".docx") ? (
                <AnimatedButton
                  onClick={() => openIncoming("docx-pdf", incoming)}
                >
                  Convert to PDF
                </AnimatedButton>
              ) : (
                <p>
                  Share one Word document or a group containing only PDFs or
                  images.
                </p>
              )}
              <AnimatedButton
                variant="ghost"
                onClick={() => {
                  incomingRef.current = [];
                  setIncoming([]);
                }}
              >
                Dismiss shared files
              </AnimatedButton>
            </div>
          </section>
        ) : null}
        <div className="route-stage" key={nativeScan ? 'native-route-stage' : routeHash(route)}>
          {scanOrigin ? <div key={`${scanOrigin.revision}-${routeHash(scanOrigin.route)}`}
            hidden={!pendingOrigin} inert aria-hidden="true">
            <RouteView route={scanOrigin.route} bannerEligible={false} presentationActive={false} />
          </div> : null}
          <div key={`${inputRevision}-${routeHash(route)}`} hidden={pendingOrigin}>
            <RouteView route={route} bannerEligible={shouldShowToolsBanner(route, incoming.length > 0, false)}
              nativeScan={nativeScan} loadNativeScanDraft={loadNativeScanDraft}
              onNativePresentation={presentScan} onEmptyScanClose={closeEmptyScan} />
          </div>
        </div>
        {webLayout || (visibleRoute.name === "tool" && visibleRoute.id === "scan") || visibleRoute.name === "viewer" ? null : (
          <div inert={scanOrigin ? true : undefined}><BottomNav activeTab={activeNavTab(visibleRoute)} /></div>
        )}
      </div>
      {webLayout ? <WebFooter /> : null}
      </WebNavProvider>
    </ThemeProvider>
  );
}

function RouteView({ route, bannerEligible, nativeScan, loadNativeScanDraft, onNativePresentation, onEmptyScanClose, presentationActive = true }: {
  route: Route; bannerEligible: boolean; nativeScan?: NativeScanAdapter;
  loadNativeScanDraft?: typeof loadScanDraft;
  onNativePresentation?: (phase: ScanPresentation) => void;
  onEmptyScanClose?: () => void; presentationActive?: boolean;
}) {
  const webLayout = useWebLayout();
  switch (route.name) {
    case "home":
      return webLayout ? <WebHome /> : <Home bannerEligible={bannerEligible} />;
    case "recents":
      return <Recents />;
    case "search":
      return <Search />;
    case "tool":
      return <ToolFlow key={route.id} id={route.id} nativeScan={nativeScan}
        loadNativeScanDraft={loadNativeScanDraft} onNativePresentation={onNativePresentation}
        onEmptyScanClose={onEmptyScanClose} presentationActive={presentationActive} />;
    case "viewer":
      return (
        <Viewer key={route.recentId ?? "memory"} recentId={route.recentId} />
      );
    case "result":
      return <Result />;
    case "settings":
      return <Settings />;
  }
}

function routeHash(route: Route): string {
  if (route.name === 'home') return '#/';
  if (route.name === 'tool') return `#/tool/${route.id}`;
  if (route.name === 'viewer') return `#/viewer${route.recentId ? '?id='+encodeURIComponent(route.recentId) : ''}`;
  return `#/${route.name}`;
}

function activeNavTab(route: Route): BottomNavTab | undefined {
  if (route.name === "home") return "tools";
  if (route.name === "recents") return "recents";
  if (route.name === "settings") return "settings";
  if (route.name === "tool" && route.id === "scan") return "scan";
  if (route.name === "search") return "search";
  if (route.name === "viewer" && route.recentId) return "recents";
  return "tools";
}

function routeTitle(route: Route): string {
  if (route.name === "home") return "Tools";
  if (route.name === "recents") return "Recent files";
  if (route.name === "search") return "Search";
  if (route.name === "settings") return "Settings";
  if (route.name === "viewer") return "Reader";
  if (route.name === "result") return "File ready";
  if (route.name === "tool") return toolById(route.id)?.title ?? "PDF tool";
  return "PDF Suite";
}
