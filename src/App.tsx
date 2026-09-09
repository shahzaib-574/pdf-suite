import { useEffect, useState, useRef } from "react";
import "./motion/gsapSetup";
import { BottomNav, type BottomNavTab } from "./components";
import { toolById } from "./lib/catalog";
import type { Route, PickedFile, ToolId } from "./lib/types";
import { subscribeIncoming } from "./store/incoming";
import { queueToolFiles } from "./store/toolInput";
import { beginViewerImport, setCurrentViewer, setLastJob } from "./store/lastJob";
import { navigate } from "./screens/nav";
import { installAppBack } from "./screens/back";
import { AnimatedButton } from "./components";
import { Home } from "./screens/Home";
import { Recents } from "./screens/Recents";
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
import { isWebsite } from './web/platform';
import { WebFooter, WebHeader, WebHome, WebNavProvider } from './web/WebHome';
import './web/website.css';

export default function App() {
  useEffect(() => { document.getElementById('app-boot')?.remove(); }, []);
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
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  useEffect(() => installAppBack(), []);

  useEffect(() => {
    void pruneStagedNativeExports();
  }, []);


  useEffect(() => {
    document.title = isWebsite && route.name === 'home' ? 'Ream PDF Suite — Free PDF tools in your browser' : `${routeTitle(route)} · Ream`;
    window.scrollTo(0, 0);
    const heading = document.querySelector<HTMLElement>(".route-stage h1");
    if (heading && !(document.activeElement instanceof HTMLInputElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [route]);

  return (
    <ThemeProvider>
      <WebNavProvider>
      {isWebsite ? <WebHeader /> : null}
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
      <div className={`app-frame${(route.name === "tool" && route.id === "scan") || route.name === "viewer" ? " app-frame--scan" : ""}`}>
        {importError ? (
          <p className="ps-banner" role="alert">
            {importError}
            <button type="button" onClick={() => setImportError("")}>
              Dismiss
            </button>
          </p>
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
        <div className="route-stage" key={routeKey(route)}>
          <RouteView key={inputRevision} route={route} />
        </div>
        {isWebsite || (route.name === "tool" && route.id === "scan") || route.name === "viewer" ? null : (
          <BottomNav activeTab={activeNavTab(route)} />
        )}
      </div>
      {isWebsite ? <WebFooter /> : null}
      </WebNavProvider>
    </ThemeProvider>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return isWebsite ? <WebHome /> : <Home />;
    case "recents":
      return <Recents />;
    case "tool":
      return <ToolFlow key={route.id} id={route.id} />;
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

function routeKey(route: Route): string {
  if (route.name === "tool") return `${route.name}-${route.id}`;
  if (route.name === "viewer")
    return `${route.name}-${route.recentId ?? "memory"}`;
  return route.name;
}

function activeNavTab(route: Route): BottomNavTab | undefined {
  if (route.name === "home") return "tools";
  if (route.name === "recents") return "recents";
  if (route.name === "settings") return "settings";
  if (route.name === "tool" && route.id === "scan") return "scan";
  if (route.name === "tool" && route.id === "pdf-docx") return "word";
  if (route.name === "viewer" && route.recentId) return "recents";
  return "tools";
}

function routeTitle(route: Route): string {
  if (route.name === "home") return "Tools";
  if (route.name === "recents") return "Recent files";
  if (route.name === "settings") return "Settings";
  if (route.name === "viewer") return "Reader";
  if (route.name === "result") return "File ready";
  if (route.name === "tool") return toolById(route.id)?.title ?? "PDF tool";
  return "PDF Suite";
}
