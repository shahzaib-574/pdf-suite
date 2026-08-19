import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatedButton, PageHeader } from '../components';
import type { PickedFile } from '../lib/types';
import { engine } from '../pdf';
import {
  currentViewerBytes,
  currentViewerName,
  lastJob,
} from '../store/lastJob';
import { getRecent } from '../store/recents';
import { navigate } from './nav';

const MAX_PAGES = 30;

type ViewerProps = {
  recentId?: string;
};

export function Viewer({ recentId }: ViewerProps) {
  const [name, setName] = useState('document.pdf');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (recentId) {
        const item = await getRecent(recentId);
        if (cancelled) return;
        if (!item) {
          setError('File not found.');
          return;
        }
        if (item.bytes.byteLength === 0) {
          setError('Preview is unavailable for this file (too large to store).');
          setName(item.name);
          return;
        }
        setName(item.name);
        setBytes(item.bytes);
        return;
      }
      const job = lastJob.result;
      if (job && job.bytes.byteLength > 0) {
        setName(job.filename);
        setBytes(job.bytes);
        return;
      }
      if (currentViewerBytes && currentViewerBytes.byteLength > 0) {
        setName(currentViewerName);
        setBytes(currentViewerBytes);
        return;
      }
      setError('Nothing to open.');
    })();
    return () => {
      cancelled = true;
    };
  }, [recentId]);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    const file: PickedFile = { name, mime: 'application/pdf', bytes };
    void engine
      .pageCount(file)
      .then((count) => {
        if (!cancelled) {
          setTotal(count);
          setPage(1);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not read PDF');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bytes, name]);

  useEffect(() => {
    if (!bytes || total < 1) return;
    const shown = Math.min(total, MAX_PAGES);
    if (page > shown) {
      setPage(shown);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const file: PickedFile = { name, mime: 'application/pdf', bytes };
    void (async () => {
      try {
        const width = Math.min(800, Math.max(280, window.innerWidth - 32));
        const blob = await engine.renderPage(file, page - 1, width);
        if (cancelled) return;
        if (blob.size === 0) {
          setRenderError('Preview unavailable');
          setSrc(null);
          return;
        }
        url = URL.createObjectURL(blob);
        setSrc(url);
        setRenderError(null);
      } catch (err) {
        if (!cancelled) {
          setRenderError(err instanceof Error ? err.message : 'Could not render page');
          setSrc(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bytes, name, page, total]);

  const shown = Math.min(total, MAX_PAGES);
  const backHash = recentId ? '#/' : lastJob.result ? '#/result' : '#/';

  return (
    <div className="ps-screen">
      <PageHeader
        title="Viewer"
        subtitle={name}
        onBack={() => navigate(backHash)}
      />
      <div className="ps-body">
        {error ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {error}
          </p>
        ) : null}
        {total > MAX_PAGES ? (
          <p className="ps-note">Showing the first {MAX_PAGES} pages.</p>
        ) : null}
        {total > 0 ? (
          <p className="ps-muted tabular">
            Page {Math.min(page, shown)} of {total}
          </p>
        ) : null}
        <div className="ps-viewer-frame">
          {src ? (
            <img src={src} alt={`Page ${page} of ${total}`} />
          ) : (
            <p className="ps-muted">{renderError ?? 'No preview'}</p>
          )}
        </div>
        <div className="ps-row">
          <AnimatedButton
            variant="ghost"
            icon={ChevronLeft}
            disabled={page <= 1}
            aria-label="Previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </AnimatedButton>
          <AnimatedButton
            variant="ghost"
            icon={ChevronRight}
            disabled={page >= shown || shown < 1}
            aria-label="Next page"
            onClick={() => setPage((p) => Math.min(shown, p + 1))}
          >
            Next
          </AnimatedButton>
        </div>
      </div>
    </div>
  );
}
