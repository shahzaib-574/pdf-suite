import { useEffect, useState } from "react";
import { Check, Download, Eye, FolderOpen, Share2, Plus } from "lucide-react";
import { AnimatedButton, PageHeader } from "../components";
import type { JobOk, ToolId } from "../lib/types";
import {
  formatBytes,
  saveBytes,
  shareOrDownload,
  shareOrDownloadBlobs,
} from "../store/files";
import { lastJob, setCurrentViewer } from "../store/lastJob";
import { saveRecent, renameRecent } from "../store/recents";
import { queueToolFiles } from "../store/toolInput";
import { navigate } from "./nav";

const retained = new WeakMap<JobOk, Promise<string>>();
function retain(job: JobOk): Promise<string> {
  let promise = retained.get(job);
  if (!promise) {
    promise = saveRecent({
      name: job.filename,
      mime: job.mime,
      tool: lastJob.tool ?? "view",
      bytes: job.bytes,
    }).then((item) => item.id);
    retained.set(job, promise);
  }
  return promise;
}

export function Result() {
  const job = lastJob.result;
  const [filename, setFilename] = useState(job?.filename ?? "document.pdf");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("Adding a local copy to Recents…");
  const [activeExport, setActiveExport] = useState<"save" | "share" | null>(
    null,
  );
  const [previews, setPreviews] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [wordPreview, setWordPreview] = useState<string[] | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [recentId, setRecentId] = useState<string | null>(null);
  const images = job?.extra?.images;
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    void retain(job)
      .then((id) => {
        if (!cancelled) {
          setRecentId(id);
          setStatus("Local copy kept in Recents. Use Save to choose a folder.");
        }
      })
      .catch((error) => {
        if (!cancelled)
          setStatus(
            `${error instanceof Error ? error.message : "Could not keep a local copy."} Save this result before leaving.`,
          );
      });
    return () => {
      cancelled = true;
    };
  }, [job]);
  useEffect(() => {
    if (!images?.[previewIndex]) return;
    const url = URL.createObjectURL(images[previewIndex]!);
    // Object URLs must be created and revoked after commit, including Strict Mode cleanup.
    // oxlint-disable-next-line react/set-state-in-effect
    setPreviews([url]);
    return () => URL.revokeObjectURL(url);
  }, [images, previewIndex]);

  if (!job)
    return (
      <div className="ps-screen">
        <PageHeader title="Result" onBack={() => navigate("#/")} />
        <div className="ps-body ps-empty-state">
          <FolderOpen size={28} />
          <h2>No file ready</h2>
          <p>Open a saved result from Recents or choose a tool.</p>
          <AnimatedButton onClick={() => navigate("#/recents")}>
            Open Recents
          </AnimatedButton>
        </div>
      </div>
    );
  const done = job;
  const isPdf = done.filename.toLowerCase().endsWith(".pdf");
  const isDocx = done.filename.toLowerCase().endsWith(".docx");
  const mime =
    done.mime ?? (isPdf ? "application/pdf" : "application/octet-stream");
  const conversion = done.extra?.pdfToDocx;
  const compression = done.extra?.compression;
  const extension = done.filename.match(/\.[^.]+$/)?.[0] ?? "";
  const outputName = (() => {
    const clean =
      filename.trim().replace(/[\\/<>:"|?*]/g, "_") || done.filename;
    return extension && !clean.toLowerCase().endsWith(extension.toLowerCase())
      ? clean + extension
      : clean;
  })();
  const canContinue = isPdf && lastJob.tool !== "protect";

  async function exportFile(action: "save" | "share") {
    setMessage(null);
    setActiveExport(action);
    try {
      const result =
        action === "save"
          ? await saveBytes(done.bytes, outputName, mime)
          : await shareOrDownload(done.bytes, outputName, mime);
      if (result.status === "cancelled") {
        setMessage("Cancelled. Your result is still available here.");
        return;
      }
      if (recentId && outputName !== done.filename) {
        try {
          await renameRecent(recentId, outputName);
        } catch {
          setStatus(
            "Export completed, but the local copy could not be renamed.",
          );
        }
      }
      setMessage(
        action === "save"
          ? "Save completed. In a browser, check Downloads."
          : "Share action completed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Export failed. Try again.",
      );
    } finally {
      setActiveExport(null);
    }
  }
  async function previewWord() {
    setPreviewBusy(true);
    setMessage(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(done.bytes);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml)
        throw new Error("This Word file has no readable document part.");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const paragraphs = Array.from(doc.getElementsByTagNameNS("*", "p"))
        .map((p) =>
          Array.from(p.getElementsByTagNameNS("*", "t"))
            .map((t) => t.textContent ?? "")
            .join(""),
        )
        .filter(Boolean);
      setWordPreview(paragraphs);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not preview text.",
      );
    } finally {
      setPreviewBusy(false);
    }
  }
  function continueWith(tool: ToolId) {
    queueToolFiles(tool, [{ name: outputName, mime, bytes: done.bytes }]);
    navigate(`#/tool/${tool}`);
  }
  return (
    <div className="ps-screen">
      <PageHeader title="Result ready" onBack={() => navigate("#/")} />
      <div className="ps-body">
        <div className="ps-result-card">
          <span className="ps-result-card__icon" aria-hidden="true">
            <Check size={27} />
          </span>
          <div>
            <h2>Your file is ready</h2>
            <p>{done.filename}</p>
          </div>
          <div className="ps-meta">
            <span>{formatBytes(done.bytes.length)}</span>
            {done.pageCount != null ? (
              <span>
                {done.pageCount}{" "}
                {isDocx
                  ? done.pageCount === 1
                    ? "source page"
                    : "source pages"
                  : done.pageCount === 1
                    ? "page"
                    : "pages"}
              </span>
            ) : null}
            {images ? <span>{images.length} images</span> : null}
          </div>
        </div>
        <p className="ps-note" role="status">
          {status}
        </p>
        <label className="ps-field">
          File name
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            maxLength={120}
          />
        </label>
        {compression ? (
          <section
            className="ps-conversion-report"
            aria-label="Compression result"
          >
            <h3>
              {compression.originalRetained
                ? "Original retained"
                : "File size reduced"}
            </h3>
            <p>
              {formatBytes(compression.originalBytes)} →{" "}
              {formatBytes(compression.outputBytes)} ·{" "}
              {Math.max(
                0,
                Math.round(
                  (1 -
                    compression.outputBytes /
                      Math.max(1, compression.originalBytes)) *
                    100,
                ),
              )}
              % smaller
            </p>
            <p>
              {compression.originalRetained
                ? "The attempted optimization did not produce a smaller safe file."
                : compression.mode === "lossless"
                  ? "Text, links, and forms are retained."
                  : "Pages are images. Selectable text, interactive links, forms, and digital signatures are not retained."}
            </p>
          </section>
        ) : null}
        {conversion ? (
          <section
            className="ps-conversion-report"
            aria-label="Conversion summary"
          >
            <h3>Conversion summary</h3>
            <p>
              These counts describe rebuilt content, not an accuracy score.
              Check the text below and review layout in a Word-compatible app
              before sharing.
            </p>
            <div className="ps-meta">
              <span>
                {conversion.editablePages} pages with editable content
              </span>
              <span>{conversion.tables} detected tables</span>
              {conversion.images ? (
                <span>{conversion.images} images</span>
              ) : null}
            </div>
            {conversion.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </section>
        ) : null}
        {done.extra?.wordToPdf?.warnings.map((warning) => (
          <p key={warning} className="ps-banner">
            {warning}
          </p>
        ))}
        {images && previews[0] ? (
          <section
            className="ps-image-result"
            aria-label="Exported page preview"
          >
            <img src={previews[0]} alt={`Exported image ${previewIndex + 1}`} />
            <div className="ps-row">
              <AnimatedButton
                variant="ghost"
                disabled={previewIndex === 0}
                onClick={() => setPreviewIndex((i) => i - 1)}
              >
                Previous
              </AnimatedButton>
              <span>
                {previewIndex + 1} / {images.length}
              </span>
              <AnimatedButton
                variant="ghost"
                disabled={previewIndex + 1 >= images.length}
                onClick={() => setPreviewIndex((i) => i + 1)}
              >
                Next
              </AnimatedButton>
            </div>
            <p className="ps-note">
              {images.length > 1
                ? "All images are packaged in the ZIP, ready to save or share."
                : "This image is ready to save or share."}
            </p>
          </section>
        ) : null}
        {wordPreview ? (
          <section className="ps-word-preview" aria-label="Word text preview">
            <h3>Text preview</h3>
            <p className="ps-note">
              Text only. Tables, images, and pagination must be checked in Word.
            </p>
            {wordPreview.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            <AnimatedButton
              variant="ghost"
              onClick={() => setWordPreview(null)}
            >
              Close text preview
            </AnimatedButton>
          </section>
        ) : null}
        {message ? (
          <p className="ps-banner" role="status">
            {message}
          </p>
        ) : null}
        <div className="ps-actions">
          <AnimatedButton
            block
            icon={Download}
            disabled={activeExport !== null}
            onClick={() => void exportFile("save")}
          >
            {activeExport === "save"
              ? "Saving…"
              : isDocx
                ? "Save Word file"
                : images && images.length > 1
                  ? "Save ZIP"
                  : isPdf
                    ? "Save PDF"
                    : "Save image"}
          </AnimatedButton>
          <AnimatedButton
            block
            variant="ghost"
            icon={Share2}
            disabled={activeExport !== null}
            onClick={() => void exportFile("share")}
          >
            {activeExport === "share" ? "Sharing…" : "Share file"}
          </AnimatedButton>
          {isPdf ? (
            <AnimatedButton
              block
              variant="ghost"
              icon={Eye}
              onClick={() => {
                setCurrentViewer(done.bytes, outputName);
                navigate("#/viewer");
              }}
            >
              Open PDF
            </AnimatedButton>
          ) : null}
          {isDocx && !wordPreview ? (
            <AnimatedButton
              block
              variant="ghost"
              icon={Eye}
              disabled={previewBusy}
              onClick={() => void previewWord()}
            >
              {previewBusy ? "Preparing preview…" : "Preview Word text"}
            </AnimatedButton>
          ) : null}
          {images && images.length > 1 ? (
            <AnimatedButton
              block
              variant="ghost"
              disabled={activeExport !== null}
              onClick={() => {
                setActiveExport("share");
                void shareOrDownloadBlobs(
                  images,
                  outputName.replace(/\.zip$/i, ""),
                )
                  .catch((error) => setMessage(String(error)))
                  .finally(() => setActiveExport(null));
              }}
            >
              Share individual images
            </AnimatedButton>
          ) : null}
        </div>
        {canContinue ? (
          <section>
            <h3>Use this PDF in another tool</h3>
            <div className="ps-row">
              {(["compress", "organize", "protect", "pdf-docx"] as const).map(
                (tool) => (
                  <AnimatedButton
                    key={tool}
                    variant="ghost"
                    onClick={() => continueWith(tool)}
                  >
                    {
                      {
                        compress: "Compress",
                        organize: "Organize",
                        protect: "Protect",
                        "pdf-docx": "Convert to Word",
                      }[tool]
                    }
                  </AnimatedButton>
                ),
              )}
            </div>
          </section>
        ) : null}
        <AnimatedButton
          block
          variant="ghost"
          icon={Plus}
          onClick={() => navigate("#/")}
        >
          New task
        </AnimatedButton>
      </div>
    </div>
  );
}
