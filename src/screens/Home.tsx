import { useEffect, useState } from 'react';
import { AppShell, StaggerGrid, ToolTile } from '../components';
import { TOOLS } from '../lib/catalog';
import type { RecentItem } from '../lib/types';
import { usePro } from '../store/entitlements';
import { listRecents } from '../store/recents';
import { TOOL_ICONS } from './icons';
import { navigate } from './nav';

export function Home() {
  const pro = usePro();
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listRecents().then((items) => {
      if (!cancelled) setRecents(items.slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell onSettings={() => navigate('#/settings')}>
      <div className="ps-home">
        <StaggerGrid>
          {TOOLS.map((tool, index) => (
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
        <section className="ps-recents">
          <h2>Recents</h2>
          {recents.length === 0 ? (
            <p className="ps-muted">Nothing here yet</p>
          ) : (
            <ul className="ps-recent-list">
              {recents.map((item) => {
                const canView = item.bytes.byteLength > 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="ps-recent"
                      disabled={!canView}
                      onClick={() => {
                        if (!canView) return;
                        navigate(`#/viewer?id=${encodeURIComponent(item.id)}`);
                      }}
                    >
                      <span className="ps-recent__name">{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {!pro ? (
          <p className="ps-note">Pro is off (dev toggle). Locked tools still open.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
