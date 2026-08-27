import { useEffect, useState } from 'react';
import { Check, Download, Eye, Share2, Plus } from 'lucide-react';
import { AnimatedButton, PageHeader } from '../components';
import { engine } from '../pdf';
import type { PickedFile } from '../lib/types';
import {
  formatBytes,
  saveBytes,
  saveImageBlobs,
  shareOrDownload,
  shareOrDownloadBlobs,
} from '../store/files';
import { lastJob, setCurrentViewer } from '../store/lastJob';
import { saveRecent } from '../store/recents';
import { navigate } from './nav';

let savedResult: typeof lastJob.result = null;

export function Result() {
  const job = lastJob.result;
  const images = job?.extra?.images;
  const conversion = job?.extra?.pdfToDocx;
  const wordNotes = job?.extra?.wordToPdf;
  const [pageCount, setPageCount] = useState<number | undefined>(job?.pageCount);
  const [message, setMessage] = useState<string | null>(null);
  const [activeExport, setActiveExport] = useState<'save' | 'share' | null>(null);

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
    if (job.filename.toLowerCase().endsWith('.docx') || job.pageCount != null) return;
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
    setActiveExport('share');
    try {
      if (hasImages && images) {
        const result = await shareOrDownloadBlobs(images, done.filename);
        if (result.status === 'cancelled') return;
        return;
      }
      if (hasFile) {
        const result = await shareOrDownload(
          done.bytes,
          done.filename,
          isDocx ? docxMime : 'application/pdf',
        );
        if (result.status === 'cancelled') return;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setActiveExport(null);
    }
  }

  async function onSave(): Promise<void> {
    setMessage(null);
    setActiveExport('save');
    try {
      if (hasImages && images) {
        const result = await saveImageBlobs(images, done.filename);
        if (result.status === 'cancelled') return;
        return;
      }
      if (hasFile) {
        const result = await saveBytes(
          done.bytes,
          done.filename,
          isDocx ? docxMime : 'application/pdf',
        );
        if (result.status === 'cancelled') return;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActiveExport(null);
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
        {wordNotes && wordNotes.warnings.length > 0 ? (
          <section className="ps-conversion-report" aria-label="Conversion notes">
            <div>
              <h3>Conversion notes</h3>
            </div>
            {wordNotes.warnings.map((warning) => (
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
          {hasPdf ? (
            <AnimatedButton block icon={Eye} onClick={openViewer}>
              Open PDF
            </AnimatedButton>
          ) : (
            <AnimatedButton
              block
              icon={Download}
              disabled={(!hasFile && !hasImages) || activeExport !== null}
              onClick={() => {
                void onSave();
              }}
            >
              {activeExport === 'save'
                ? 'Saving…'
                : isDocx
                  ? 'Save Word file'
                  : hasImages
                    ? 'Save images'
                    : 'Save file'}
            </AnimatedButton>
          )}
          <AnimatedButton
            block
            variant="ghost"
            icon={Share2}
            disabled={(!hasFile && !hasImages) || activeExport !== null}
            onClick={() => {
              void onShare();
            }}
          >
            {activeExport === 'share' ? 'Sharing…' : 'Share'}
          </AnimatedButton>
          {hasPdf ? (
            <AnimatedButton
              block
              variant="ghost"
              icon={Download}
              disabled={activeExport !== null}
              onClick={() => {
                void onSave();
              }}
            >
              {activeExport === 'save' ? 'Saving…' : 'Save PDF'}
            </AnimatedButton>
          ) : null}
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
