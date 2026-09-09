import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  Clock3,
  FilePenLine,
  Search,
} from "lucide-react";
import { AppShell, FileThumb, StaggerGrid, ToolTile } from "../components";
import { TOOLS, toolMatchesQuery } from "../lib/catalog";
import type { RecentItem, ToolId } from "../lib/types";
import { formatBytes, saveBytes } from "../store/files";
import { listRecents } from "../store/recents";
import { recentFile } from "../store/toolInput";
import { TOOL_ICONS } from "./icons";
import { navigate } from "./nav";
import { loadScanDraft } from '../store/scanDraft';

type FilterId = "all" | "convert" | "edit" | "capture";

const FILTERS: { id: FilterId; label: string; tools?: ToolId[] }[] = [
  { id: "all", label: "All" },
  {
    id: "convert",
    label: "Convert",
    tools: ["images", "pdf-images", "docx-pdf", "pdf-docx"],
  },
  {
    id: "edit",
    label: "Edit",
    tools: [
      "merge",
      "split",
      "compress",
      "organize",
      "watermark",
      "numbers",
      "protect",
    ],
  },
  { id: "capture", label: "Scan & view", tools: ["scan", "view"] },
];

export function Home() {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [query, setQuery] = useState("");
  const [draftPages, setDraftPages] = useState(0);
  useEffect(() => {let current=true;void loadScanDraft().then(draft=>{if(current)setDraftPages(draft?.files.length ?? 0);}).catch(()=>undefined);return()=>{current=false;};}, []);
  const [filter, setFilter] = useState<FilterId>("all");
  const [savingRecentId, setSavingRecentId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      void listRecents()
        .then((items) => {
          if (!cancelled) setRecents(items.slice(0, 3));
        })
        .catch(() => {
          if (!cancelled)
            setExportError(
              "Recent files could not be loaded. You can still choose a file to use a tool.",
            );
        });
    }
    load();
    window.addEventListener("ream-library-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("ream-library-changed", load);
    };
  }, []);

  const visibleTools = useMemo(() => {
    const toolIds = FILTERS.find((item) => item.id === filter)?.tools;
    return TOOLS.filter((tool) => tool.available !== false)
      .filter((tool) => !toolIds || toolIds.includes(tool.id))
      .filter((tool) => toolMatchesQuery(tool, query));
  }, [filter, query]);

  async function saveRecentFile(item: RecentItem): Promise<void> {
    setExportError(null);
    setSavingRecentId(item.id);
    try {
      const file = await recentFile(item.id);
      const result = await saveBytes(file.bytes, item.name, item.mime);
      if (result.status === "cancelled") return;
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : `Could not save ${item.name}`,
      );
    } finally {
      setSavingRecentId(null);
    }
  }

  const searching = query.trim().length > 0;

  return (
    <AppShell>
      <div className="ps-home">
        <label className="ps-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search tools</span>
          <input
            type="search"
            value={query}
            placeholder="Search tools"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {searching ? null : (
          <section className="ps-home-hero">
            <div className="ps-page-intro">
              <h1>Your next document, ready.</h1>
              <p>
                Scan a page, convert a file, or pick up where you left off.
              </p>
            </div>
            <div className="ps-home-quick" aria-label="Quick actions">
              <button
                className="ps-feature-card"
                type="button"
                onClick={() => navigate("#/tool/scan")}
              >
                <span className="ps-feature-card__icon" aria-hidden="true">
                  <Camera size={22} />
                </span>
                <span className="ps-feature-card__copy">
                  <strong>
                    {draftPages ? "Resume scan" : "Scan a document"}
                  </strong>
                  <span>
                    {draftPages
                      ? `${draftPages} saved ${draftPages === 1 ? "page" : "pages"} · Continue editing`
                      : "Capture, clean up, and share a PDF"}
                  </span>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ps-feature-card"
                onClick={() => navigate("#/tool/pdf-docx")}
              >
                <span className="ps-feature-card__icon" aria-hidden="true">
                  <FilePenLine size={22} />
                </span>
                <span className="ps-feature-card__copy">
                  <strong>PDF → Word</strong>
                  <span>Make an editable copy of your PDF</span>
                </span>
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {searching ? null : <section className="ps-recents" aria-labelledby="recents-title">
          <div className="ps-section-heading ps-section-heading--compact">
            <div>
              <h2 id="recents-title">Recent files</h2>
            </div>
            {recents.length > 0 ? (
              <button
                type="button"
                className="ps-text-action"
                onClick={() => navigate("#/recents")}
              >
                See all <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {recents.length === 0 ? (
            <div className="ps-inline-empty">
              <Clock3 size={20} aria-hidden="true" />
              <span>Finished files will appear here.</span>
            </div>
          ) : (
            <>
              {exportError ? (
                <p className="ps-banner ps-banner--error" role="alert">
                  {exportError}
                </p>
              ) : null}
              <ul className="ps-recent-list">
                {recents.map((item) => {
                  const canView = item.stored === true;
                  const isPdf =
                    item.mime === "application/pdf" ||
                    item.name.toLowerCase().endsWith(".pdf");
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="ps-recent"
                        disabled={!canView || savingRecentId !== null}
                        onClick={() => {
                          if (!canView) return;
                          if (isPdf)
                            navigate(
                              `#/viewer?id=${encodeURIComponent(item.id)}`,
                            );
                          else void saveRecentFile(item);
                        }}
                      >
                        <FileThumb
                          id={item.id}
                          name={item.name}
                          mime={item.mime}
                          stored={canView}
                          size="sm"
                        />
                        <span className="ps-recent__copy">
                          <span className="ps-recent__name" dir="auto">
                            {item.name}
                          </span>
                          <span className="ps-recent__action tabular">
                            {!canView
                              ? "Original needed"
                              : savingRecentId === item.id
                                ? "Saving…"
                                : formatBytes(item.size)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>}

        <section className="ps-tools-section" aria-labelledby="tools-title">
          <div className="ps-section-heading">
            <h2 id="tools-title">All tools</h2>
          </div>

          <div className="ps-filter-rail" aria-label="Filter tools by category">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                className={
                  filter === item.id ? "ps-filter is-active" : "ps-filter"
                }
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {visibleTools.length > 0 ? (
            <StaggerGrid>
              {visibleTools.map((tool, index) => (
                <ToolTile
                  key={tool.id}
                  title={tool.title}
                  blurb={tool.blurb}
                  icon={TOOL_ICONS[tool.id]}
                  index={index}
                  onSelect={() => navigate(`#/tool/${tool.id}`)}
                />
              ))}
            </StaggerGrid>
          ) : (
            <p className="ps-search-empty">
              No matching tools. Try a broader search.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
