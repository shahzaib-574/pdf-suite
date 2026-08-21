import { useEffect, useState } from 'react';
import { Check, Download, Eye, Share2, Plus } from 'lucide-react';
import { AnimatedButton, PageHeader } from '../components';
import { engine } from '../pdf';
import type { PickedFile } from '../lib/types';
import {
  formatBytes,
  shareOrDownload,
  shareOrDownloadBlobs,
  downloadBytes,
  downloadBlob,
} from '../store/files';
import { lastJob, setCurrentViewer } from '../store/lastJob';
import { saveRecent } from '../store/recents';
import { navigate } from './nav';

let savedResult: typeof lastJob.result = null;

export function Result() {
  const job = lastJob.result;
  const images = job?.extra?.images;
  const conversion = job?.extra?.pdfToDocx;
  const [pageCount, setPageCount] = useState<number | undefined>(job?.pageCount);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    if (savedResult !== job) {
      savedResult = job;
      if (job.bytes.byteLength > 0) {
        void saveRecent({
          name: job.filename,
          mime: job.mime,
          tool: lastJob.tool ?? 'view',
          bytes: job.bytes,
        }).catch(() => {
          setMessage('Created successfully, but it could not be added to Recents.');
        });
      }
    }
    if (job.filename.toLowerCase().endsWith('.docx')) {
      setPageCount(job.pageCount);
      return;
    }
    if (job.pageCount != null) {
      setPageCount(job.pageCount);
      return;
    }
    if (job.bytes.byteLength === 0) return;
    let cancelled = false;
    const file: PickedFile = {
      name: job.filename,
      mime: 'application/pdf',
      bytes: job.bytes,
    };
    void engine
      .pageCount(file)
      .then((count) => {
        if (!cancelled) setPageCount(count);
      })
      .catch(() => {
        if (!cancelled) setPageCount(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [job]);

  if (!job) {
    return (
      <div className="ps-screen">
        <PageHeader title="Result" onBack={() => navigate('#/')} />
        <div className="ps-body">
          <p className="ps-muted">Nothing to show.</p>
          <div className="ps-actions">
            <AnimatedButton block onClick={() => navigate('#/')}>
              New
            </AnimatedButton>
          </div>
        </div>
      </div>
    );
  }

  const done = job;
  const isDocx =
    done.mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    done.filename.toLowerCase().endsWith('.docx');
  const isPdf = done.mime === 'application/pdf' || done.filename.toLowerCase().endsWith('.pdf');
  const docxMime =
    done.mime ??
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const hasPdf = done.bytes.byteLength > 0 && isPdf;
  const hasFile = done.bytes.byteLength > 0;
  const hasImages = Boolean(images && images.length > 0);

  function openViewer(): void {
    if (!hasPdf) return;
    setCurrentViewer(done.bytes, done.filename);
    navigate('#/viewer');
  }

  async function onShare(): Promise<void> {
    setMessage(null);
    try {
      if (hasImages && images) {
        await shareOrDownloadBlobs(images, 'page');
        return;
      }
      if (hasFile) {
        await shareOrDownload(
          done.bytes,
          done.filename,
          isDocx ? docxMime : 'application/pdf',
        );
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Share failed');
    }
  }

  function onSave(): void {
    if (hasImages && images) {
      images.forEach((blob, index) => {
        const type = blob.type || 'image/jpeg';
        const ext = type.includes('png') ? 'png' : 'jpg';
        downloadBlob(blob, `page-${String(index + 1).padStart(2, '0')}.${ext}`);
      });
      return;
    }
    if (hasFile) {
      downloadBytes(
        done.bytes,
        done.filename,
        isDocx ? docxMime : 'application/pdf',
      );
    }
  }

  return (
    <div className="ps-screen">
      <PageHeader title="Done" subtitle={job.filename} onBack={() => navigate('#/')} />
      <div className="ps-body">
        <div className="ps-result-card">
          <span className="ps-result-card__icon" aria-hidden="true">
            <Check size={27} strokeWidth={2.4} />
          </span>
          <div>
            <h2>Your file is ready</h2>
            <p>{job.filename}</p>
          </div>
          <div className="ps-meta">
            {hasFile ? <span className="tabular">{formatBytes(job.bytes.byteLength)}</span> : null}
            {pageCount != null ? (
              <span>{pageCount} page{pageCount === 1 ? '' : 's'}</span>
            ) : null}
            {hasImages && images ? (
              <span>{images.length} image{images.length === 1 ? '' : 's'}</span>
            ) : null}
          </div>
        </div>
        {conversion ? (
          <section className="ps-conversion-report" aria-label="PDF to Word conversion quality">
            <div>
              <h3>Conversion quality</h3>
              <p>
                Editable structure was rebuilt on this device. Review complex fonts and forms
                before sharing the Word file.
              </p>
            </div>
            <div className="ps-meta">
              <span>{conversion.editablePages} editable page{conversion.editablePages === 1 ? '' : 's'}</span>
              {conversion.tables > 0 ? (
                <span>{conversion.tables} table{conversion.tables === 1 ? '' : 's'}</span>
              ) : null}
              {conversion.columnGroups > 0 ? (
                <span>{conversion.columnGroups} column group{conversion.columnGroups === 1 ? '' : 's'}</span>
              ) : null}
              {conversion.images > 0 ? (
                <span>{conversion.images} image{conversion.images === 1 ? '' : 's'}</span>
              ) : null}
            </div>
            {conversion.warnings.map((warning) => (
              <p className="ps-conversion-report__warning" key={warning}>
                {warning}
              </p>
            ))}
          </section>
        ) : null}
        {message ? (
          <p className="ps-banner ps-banner--error" role="alert">
            {message}
          </p>
        ) : null}
        <div className="ps-actions">
          <AnimatedButton
            block
            icon={Eye}
            disabled={!hasPdf}
            onClick={openViewer}
          >
            Open
          </AnimatedButton>
          <AnimatedButton
            block
            variant="ghost"
            icon={Share2}
            disabled={!hasFile && !hasImages}
            onClick={() => {
              void onShare();
            }}
          >
            Share
          </AnimatedButton>
          <AnimatedButton
            block
            variant="ghost"
            icon={Download}
            disabled={!hasFile && !hasImages}
            onClick={onSave}
          >
            Save
          </AnimatedButton>
          <AnimatedButton
            block
            variant="ghost"
            icon={Plus}
            onClick={() => navigate('#/')}
          >
            New
          </AnimatedButton>
        </div>
      </div>
    </div>
  );
}
