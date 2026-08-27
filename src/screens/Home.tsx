import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { AppShell, StaggerGrid, ToolTile } from '../components';
import { TOOLS } from '../lib/catalog';
import type { RecentItem, ToolId } from '../lib/types';
import { formatBytes, saveBytes } from '../store/files';
import { listRecents } from '../store/recents';
import { TOOL_ICONS } from './icons';
import { navigate } from './nav';

type FilterId = 'all' | 'convert' | 'edit' | 'capture';

const FILTERS: { id: FilterId; label: string; tools?: ToolId[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'convert', label: 'Convert', tools: ['images', 'pdf-images', 'docx-pdf', 'pdf-docx'] },
  {
    id: 'edit',
    label: 'Edit',
    tools: ['merge', 'split', 'compress', 'organize', 'watermark', 'numbers', 'protect'],
  },
  { id: 'capture', label: 'Scan & view', tools: ['scan', 'view'] },
];

export function Home() {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [savingRecentId, setSavingRecentId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRecents().then((items) => {
      if (!cancelled) setRecents(items.slice(0, 3));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const toolIds = FILTERS.find((item) => item.id === filter)?.tools;
    return TOOLS.filter((tool) => tool.available !== false)
      .filter((tool) => !toolIds || toolIds.includes(tool.id))
      .filter(
        (tool) =>
          !normalized ||
          tool.title.toLowerCase().includes(normalized) ||
          tool.blurb.toLowerCase().includes(normalized),
      );
  }, [filter, query]);

  async function saveRecentFile(item: RecentItem): Promise<void> {
    setExportError(null);
    setSavingRecentId(item.id);
    try {
      const result = await saveBytes(item.bytes, item.name, item.mime);
      if (result.status === 'cancelled') return;
    } catch (error) {
      setExportError(error instanceof Error ? error.message : `Could not save ${item.name}`);
    } finally {
      setSavingRecentId(null);
    }
  }

  return (
    <AppShell
      onSettings={() => navigate('#/settings')}
    >
      <div className="ps-home">
        <section className="ps-home-hero">
          <div className="ps-page-intro">
            <p className="ps-eyebrow">Private PDF workspace</p>
            <h1>What do you want to make?</h1>
            <p>Fast, focused tools. Your files never leave this device.</p>
          </div>
          <button
            type="button"
            className="ps-feature-card"
            onClick={() => navigate('#/tool/pdf-docx')}
          >
            <span className="ps-feature-card__icon" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <span className="ps-feature-card__copy">
              <strong>Smart PDF to Word</strong>
              <span>Rebuild text, tables, spacing, and scanned pages</span>
            </span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </section>

        <section className="ps-tools-section" aria-labelledby="tools-title">
          <div className="ps-section-heading">
            <div>
              <p className="ps-eyebrow">Toolkit</p>
              <h2 id="tools-title">Choose a tool</h2>
            </div>
            <span className="ps-privacy-pill">
              <ShieldCheck size={14} aria-hidden="true" /> On-device
            </span>
          </div>

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

          <div className="ps-filter-rail" aria-label="Filter tools by category">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                className={filter === item.id ? 'ps-filter is-active' : 'ps-filter'}
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
                  pro={tool.pro}
                  index={index}
                  onSelect={() => navigate(`#/tool/${tool.id}`)}
                />
              ))}
            </StaggerGrid>
          ) : (
            <p className="ps-search-empty">No matching tools. Try a broader search.</p>
          )}
        </section>

        <section className="ps-recents" aria-labelledby="recents-title">
          <div className="ps-section-heading ps-section-heading--compact">
            <div>
              <p className="ps-eyebrow">Your workspace</p>
              <h2 id="recents-title">Recent files</h2>
            </div>
            <button type="button" className="ps-text-action" onClick={() => navigate('#/recents')}>
              See all <ArrowRight size={15} aria-hidden="true" />
            </button>
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
                  const canView = item.bytes.byteLength > 0;
                  const isPdf =
                    item.mime === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="ps-recent"
                        disabled={!canView || savingRecentId !== null}
                        onClick={() => {
                          if (!canView) return;
                          if (isPdf) navigate(`#/viewer?id=${encodeURIComponent(item.id)}`);
                          else void saveRecentFile(item);
                        }}
                      >
                        <span className="ps-recent__name">{item.name}</span>
                        <span className="ps-recent__action tabular">
                          {savingRecentId === item.id ? 'Saving…' : formatBytes(item.size)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
