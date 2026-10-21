import type { PdfViewerSession } from "../pdf/render";

type Entry = {
  url: string;
  width: number;
  visible: boolean;
  evict: () => void;
};

/**
 * Owns rendered page object URLs for one viewer session. Visible pages are
 * never evicted; once more than `limit` images are held, the least recently
 * seen off-screen ones are revoked and their owners told to drop the <img>.
 */
export class ViewerImageCache {
  private readonly entries = new Map<number, Entry>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** The cached URL for `key` if it was rendered at `width`. */
  lookup(key: number, width: number): string | undefined {
    const entry = this.entries.get(key);
    return entry && entry.width === width ? entry.url : undefined;
  }

  set(key: number, url: string, width: number, evict: () => void): void {
    const previous = this.entries.get(key);
    if (previous && previous.url !== url) URL.revokeObjectURL(previous.url);
    this.entries.delete(key);
    this.entries.set(key, { url, width, visible: true, evict });
    this.trim();
  }

  setVisible(key: number, visible: boolean): void {
    const entry = this.entries.get(key);
    if (!entry || entry.visible === visible) return;
    entry.visible = visible;
    // Re-insert so iteration order runs from least to most recently seen.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.trim();
  }

  remove(key: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    URL.revokeObjectURL(entry.url);
    this.entries.delete(key);
  }

  private trim(): void {
    while (this.entries.size > this.limit) {
      let victim: number | undefined;
      for (const [key, entry] of this.entries) {
        if (!entry.visible) {
          victim = key;
          break;
        }
      }
      if (victim === undefined) return;
      const entry = this.entries.get(victim)!;
      this.entries.delete(victim);
      URL.revokeObjectURL(entry.url);
      entry.evict();
    }
  }
}

// Full-size pages are a few MB decoded each; thumbnails are ~150 KB.
const PAGE_IMAGE_LIMIT = 12;
const THUMBNAIL_LIMIT = 48;

const caches = new WeakMap<
  PdfViewerSession,
  { pages: ViewerImageCache; thumbnails: ViewerImageCache }
>();

export function viewerImageCaches(session: PdfViewerSession): {
  pages: ViewerImageCache;
  thumbnails: ViewerImageCache;
} {
  let entry = caches.get(session);
  if (!entry) {
    entry = {
      pages: new ViewerImageCache(PAGE_IMAGE_LIMIT),
      thumbnails: new ViewerImageCache(THUMBNAIL_LIMIT),
    };
    caches.set(session, entry);
  }
  return entry;
}
