import { useEffect, useState } from "react";
import {
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { AnimatedButton, AppShell } from "../components";
import type { RecentItem } from "../lib/types";
import { formatBytes, saveBytes } from "../store/files";
import { listRecents, renameRecent, deleteRecent } from "../store/recents";
import { recentFile } from "../store/toolInput";
import { navigate } from "./nav";

function relativeDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

export function Recents() {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRecents()
      .then((recentItems) => {
        if (!cancelled) setItems(recentItems);
      })
      .catch(() => {
        if (!cancelled)
          setExportError(
            "Your library could not be loaded. Try reopening Recents.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRecentFile(item: RecentItem): Promise<void> {
    setExportError(null);
    setSavingId(item.id);
    try {
      const file = await recentFile(item.id);
      const result = await saveBytes(file.bytes, item.name, item.mime);
      if (result.status === "cancelled") return;
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : `Could not save ${item.name}`,
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AppShell>
      <section className="ps-library">
        <div className="ps-page-intro">
          <p className="ps-eyebrow">Your workspace</p>
          <h1>Recent files</h1>
          <p>Open or save files you created on this device.</p>
        </div>
        <label className="ps-field">
          Search files
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="File name"
          />
        </label>
        {exportError ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {exportError}
          </p>
        ) : null}
        {items.length === 0 ? (
          <div className="ps-empty-state">
            <span className="ps-empty-state__icon" aria-hidden="true">
              <Clock3 size={28} />
            </span>
            <h2>No files yet</h2>
            <p>Your finished documents will appear here automatically.</p>
            <AnimatedButton icon={FolderOpen} onClick={() => navigate("#/")}>
              Browse tools
            </AnimatedButton>
          </div>
        ) : (
          <>
            <ul className="ps-library-list">
              {items
                .filter((item) =>
                  item.name
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
                )
                .map((item) => {
                  const isPdf =
                    item.mime === "application/pdf" ||
                    item.name.toLowerCase().endsWith(".pdf");
                  const canOpen = item.stored === true;
                  const saving = savingId === item.id;
                  return (
                    <li key={item.id} className="ps-library-item">
                      <span className="ps-file-icon" aria-hidden="true">
                        <FileText size={20} />
                      </span>
                      <button
                        type="button"
                        className="ps-library-item__main"
                        disabled={!canOpen || savingId !== null}
                        onClick={() => {
                          if (!canOpen) return;
                          if (isPdf)
                            navigate(
                              `#/viewer?id=${encodeURIComponent(item.id)}`,
                            );
                          else void saveRecentFile(item);
                        }}
                      >
                        <span className="ps-library-item__name">
                          {item.name}
                        </span>
                        <span className="ps-library-item__meta tabular">
                          {!canOpen
                            ? "Original file needed — no retained copy"
                            : saving
                              ? "Saving…"
                              : `${formatBytes(item.size)} · ${relativeDate(item.createdAt)}`}
                        </span>
                      </button>
                      <AnimatedButton
                        variant="ghost"
                        className="btn--icon ps-library-item__action"
                        icon={Download}
                        aria-label={
                          saving ? `Saving ${item.name}` : `Save ${item.name}`
                        }
                        disabled={!canOpen || savingId !== null}
                        onClick={() => {
                          void saveRecentFile(item);
                        }}
                      />
                      <AnimatedButton
                        variant="ghost"
                        className="btn--icon"
                        icon={Pencil}
                        aria-label={`Rename ${item.name}`}
                        onClick={() => {
                          setEditing(item.id);
                          setNewName(item.name);
                          setDeleting(null);
                        }}
                      />
                      <AnimatedButton
                        variant="ghost"
                        className="btn--icon"
                        icon={Trash2}
                        aria-label={`Remove ${item.name} from Recents`}
                        onClick={() => {
                          setDeleting(item.id);
                          setEditing(null);
                        }}
                      />
                      {editing === item.id ? (
                        <form
                          className="ps-library-edit"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const extension =
                              item.name.match(/\.[^.]+$/)?.[0] ?? "";
                            const clean = newName
                              .trim()
                              .replace(/[\\/<>:"|?*]/g, "_");
                            if (!clean) return;
                            const name =
                              extension &&
                              !clean
                                .toLowerCase()
                                .endsWith(extension.toLowerCase())
                                ? clean + extension
                                : clean;
                            void renameRecent(item.id, name)
                              .then(() => {
                                setItems((rows) =>
                                  rows.map((row) =>
                                    row.id === item.id ? { ...row, name } : row,
                                  ),
                                );
                                setEditing(null);
                              })
                              .catch(() =>
                                setExportError("Could not rename this file."),
                              );
                          }}
                        >
                          <label className="ps-field">
                            File name
                            <input
                              autoFocus
                              value={newName}
                              maxLength={120}
                              onChange={(e) => setNewName(e.target.value)}
                            />
                          </label>
                          <AnimatedButton type="submit">
                            Save name
                          </AnimatedButton>
                          <AnimatedButton
                            variant="ghost"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </AnimatedButton>
                        </form>
                      ) : null}
                      {deleting === item.id ? (
                        <div className="ps-library-edit">
                          <p>
                            Remove this local copy? Files already saved outside
                            Ream are kept.
                          </p>
                          <AnimatedButton
                            onClick={() => {
                              void deleteRecent(item.id)
                                .then(() => {
                                  setItems((rows) =>
                                    rows.filter((row) => row.id !== item.id),
                                  );
                                  setDeleting(null);
                                })
                                .catch(() =>
                                  setExportError("Could not remove this file."),
                                );
                            }}
                          >
                            Remove local copy
                          </AnimatedButton>
                          <AnimatedButton
                            variant="ghost"
                            onClick={() => setDeleting(null)}
                          >
                            Keep file
                          </AnimatedButton>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
            {items.length > 0 &&
            !items.some((item) =>
              item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            ) ? (
              <p>No files match your search.</p>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}
