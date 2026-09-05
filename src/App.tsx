import { useEffect, useState, useRef } from "react";
import "./motion/gsapSetup";
import { BottomNav, type BottomNavTab } from "./components";
import { toolById } from "./lib/catalog";
import type { Route, PickedFile, ToolId } from "./lib/types";
import { subscribeIncoming } from "./store/incoming";
import { queueToolFiles } from "./store/toolInput";
import { setCurrentViewer, setLastJob } from "./store/lastJob";
import { navigate } from "./screens/nav";
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
import { ThemeProvider } from "./theme/ThemeProvider";
import { markUpdateReady } from "./store/updates";

export default function App() {
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void markUpdateReady(); });
    return () => cancelAnimationFrame(frame);
  }, []);
  const [inputRevision, setInputRevision] = useState(0);
  const [incoming, setIncoming] = useState<PickedFile[]>([]);
  const incomingRef = useRef<PickedFile[]>([]);
  const [importError, setImportError] = useState("");
  useEffect(
    () =>
      subscribeIncoming((files) => {
        const combined = [...incomingRef.current, ...files];
        if (
          combined.length > 200 ||
          combined.reduce((sum, f) => sum + f.bytes.length, 0) > MAX_INPUT_BYTES
        ) {
          setImportError(
            "Shared files exceed 200 files or 128 MB. Use or dismiss the current group, then share the new files again.",
          );
          return;
        }
        const file = combined[0];
        if (
          combined.length === 1 && file &&
          (file.mime.toLowerCase() === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf"))
        ) {
          // An external PDF is an open request, not a tool-selection request.
          // Clear the previous result because Viewer otherwise prefers its bytes.
          setLastJob(null, null);
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
      }, setImportError),
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
    if (!window.location.hash || window.location.hash === "#") {
      window.history.replaceState({ reamDepth: 0 }, "", "#/");
    } else if (window.history.state?.reamDepth == null) {
      window.history.replaceState(
        { ...window.history.state, reamDepth: 0 },
        "",
        window.location.href,
      );
    }
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  useEffect(() => {
    void pruneStagedNativeExports();
  }, []);


  useEffect(() => {
    document.title = `${routeTitle(route)} · Ream`;
    window.scrollTo(0, 0);
    const heading = document.querySelector<HTMLElement>(".route-stage h1");
    if (heading && !(document.activeElement instanceof HTMLInputElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [route]);

  return (
    <ThemeProvider>
      <button
        type="button"
        hidden={route.name === "tool" && route.id === "scan"}
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
      <div className={`app-frame${route.name === "tool" && route.id === "scan" ? " app-frame--scan" : ""}`}>
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
        {route.name === "tool" && route.id === "scan" ? null : <BottomNav activeTab={activeNavTab(route)} />}
      </div>
    </ThemeProvider>
  );
}

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <Home />;
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
