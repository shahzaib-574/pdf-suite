import { useMemo, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { AppShell, StaggerGrid, ToolTile } from "../components";
import { TOOLS, toolMatchesQuery } from "../lib/catalog";
import { TOOL_ICONS } from "./icons";
import { navigate } from "./nav";

export function Search() {
  const [query, setQuery] = useState("");

  const visibleTools = useMemo(
    () =>
      TOOLS.filter((tool) => tool.available !== false).filter((tool) =>
        toolMatchesQuery(tool, query),
      ),
    [query],
  );

  return (
    <AppShell>
      <div className="ps-home">
        <div className="ps-page-intro">
          <h1>Search</h1>
          <p>Find a tool by name or what it does.</p>
        </div>

        <label className="ps-search">
          <SearchIcon size={18} aria-hidden="true" />
          <span className="sr-only">Search tools</span>
          <input
            type="search"
            value={query}
            placeholder="Search tools"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <section className="ps-tools-section" aria-label="Matching tools">
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
