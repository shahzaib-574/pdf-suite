import { useEffect, useState } from 'react';
import { Clock3, Download, FileText, FolderOpen } from 'lucide-react';
import { AnimatedButton, AppShell } from '../components';
import type { RecentItem } from '../lib/types';
import { downloadBytes, formatBytes } from '../store/files';
import { listRecents } from '../store/recents';
import { navigate } from './nav';

function relativeDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(timestamp);
}

export function Recents() {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listRecents().then((recentItems) => {
      if (!cancelled) setItems(recentItems);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      onSettings={() => navigate('#/settings')}
    >
      <section className="ps-library">
        <div className="ps-page-intro">
          <p className="ps-eyebrow">Your workspace</p>
          <h1>Recent files</h1>
          <p>Open or save files you created on this device.</p>
        </div>
        {items.length === 0 ? (
          <div className="ps-empty-state">
            <span className="ps-empty-state__icon" aria-hidden="true">
              <Clock3 size={28} />
            </span>
            <h2>No files yet</h2>
            <p>Your finished documents will appear here automatically.</p>
            <AnimatedButton icon={FolderOpen} onClick={() => navigate('#/')}>
              Browse tools
            </AnimatedButton>
          </div>
        ) : (
          <ul className="ps-library-list">
            {items.map((item) => {
              const isPdf =
                item.mime === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');
              const canOpen = isPdf && item.bytes.byteLength > 0;
              return (
                <li key={item.id} className="ps-library-item">
                  <span className="ps-file-icon" aria-hidden="true">
                    <FileText size={20} />
                  </span>
                  <button
                    type="button"
                    className="ps-library-item__main"
                    disabled={!canOpen}
                    onClick={() => navigate(`#/viewer?id=${encodeURIComponent(item.id)}`)}
                  >
                    <span className="ps-library-item__name">{item.name}</span>
                    <span className="ps-library-item__meta tabular">
                      {formatBytes(item.size)} · {relativeDate(item.createdAt)}
                    </span>
                  </button>
                  <AnimatedButton
                    variant="ghost"
                    className="btn--icon ps-library-item__action"
                    icon={Download}
                    aria-label={`Save ${item.name}`}
                    disabled={item.bytes.byteLength === 0}
                    onClick={() => downloadBytes(item.bytes, item.name, item.mime)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
