# Document quality improvements — 5 September 2026

Implemented against the existing 13 tools. The focus is dependable output, reduced repeated work, and fewer steps between creating and sending a file. These changes have not been published to Google Play.

| Feature | Change |
| --- | --- |
| Reader | Password entry and retry; opens after loading the first page, then indexes search and dimensions in the background; bounded canvas sizes. |
| Merge | User-controlled input ordering, sequential input reads, bounded input size, cancellable worker processing. |
| Split | Non-contiguous page selections and explicit output order, validated before processing. |
| Images to PDF | Input ordering, A4/Letter/original sizing, orientation and margins; large-photo normalization. |
| Scan | Manual four-corner perspective correction, rotation, grayscale and adaptive black/white enhancement in a worker; restore original and cancel adjustment. |
| Compress | Default preserves text/forms by reserializing PDF objects; existing signature fields retain original bytes. Raster modes explicitly describe their quality tradeoff. Never returns a larger file. Shows real before/after size. |
| Organize | Thirty-page preview groups, one PDF.js session per group instead of reopening for each thumbnail; existing order/rotate/delete controls retained. |
| Watermark | Adjustable angle and bundled Unicode fonts; rejects unsupported characters instead of corrupting the label. |
| Page numbers | Starting number, left/center/right position, optional total. |
| Protect | Preserves intentional spaces in passwords; generated encrypted documents can be reopened with the reader password prompt. |
| PDF to images | JPEG/PNG, resolution and selected pages; packages the output before declaring success. A 41-image job no longer fails at Save because of the former 40-image limit. |
| Word to PDF | Bundled Latin/Greek/Cyrillic fonts; explicit unsupported-character/image errors; archive expansion checks before loading DOCX parts. Layout remains simplified. |
| PDF to Word | Dominant scanned-page images trigger English OCR even when a selectable header exists; removes former image-placement exclusions; records OCR and image-fallback warnings. |

## Shared flow and efficiency

- Results have filename editing, image previews, an optional Word text preview, explicit local-copy status, Save/Share, and PDF follow-on tools.
- Recents stores metadata separately from document bytes; listing the library no longer loads every saved document. Legacy copies migrate. Files above the old 8 MB threshold are actually retained. Writes are serialized within an app session; the byte/metadata save is one IndexedDB transaction.
- Local limits: 200 library entries / 512 MB, subject to quota. No automatic deletion of existing documents to make room. Inputs: 200 files / 128 MB. Image exports: 200 selected pages / 64 MB. Camera capture has its existing 20-page session limit.
- Images normalize to a maximum 3200-pixel side; edited scans to 2200. PDF rendering is bounded to approximately 12 megapixels and 8192 pixels per side.
- Long jobs expose cancellation; PDF workers can be terminated and recreated. Page-based operations yield between pages. This is not a resumable background job system.
- Android incoming PDF/DOCX/image sharing uses content URIs, bounded cache staging, chunked bridge reads and cleanup, without broad storage permissions. New shares wait in an inbox instead of replacing an active operation.
- Unicode font code is loaded only when needed. The PDF rendering/OCR libraries remain lazy-loaded. The web build still reports large document-engine chunks; no unmeasured speedup percentage is claimed.

## Verification

Automated checks cover existing PDF operations and Word layout fixtures, plus:

- Legacy library migration, retrieval of a 9 MB file, metadata-only listing, concurrent saves, rename/delete/clear.
- A 41-image ZIP and rejection above 200 images.
- Actual text and order extracted from generated split/numbered/watermarked PDFs.
- Form preservation, byte-identical handling of a signature field, and opening an encrypted PDF with a whitespace-sensitive password.
- Greek/Cyrillic/Polish output text, image-PDF dimensions, page-selection validation and perspective geometry.

Commands: `npm run quality-selfcheck`, `npm run pdf-selfcheck`, `npm run docx-selfcheck`, `npm run lint`, `npm run build`, `npm run verify:store-assets`, and `npm run verify:android-artifact -- --self-test`. Quality self-checks are also added to verification CI. The static Impeccable detector reported no findings for the selected changed UI files; this is not a visual or contrast certification.

## Remaining verification and product limits

- Browser verification subsequently passed using an isolated Playwright/Chrome runner. See [browser QA](browser-qa.md) for the 25 checks, synthetic timings and remaining device limits.
- Local Gradle verification cannot start: JAVA_HOME is unset and Java is absent from PATH. Android incoming intents, cancellation, camera capture, low-memory behavior and min-SDK WebView compatibility require Android device/CI testing before release.
- Device timing, battery usage, peak memory, OCR accuracy and store conversion/retention have not been benchmarked. Build success is not a performance measurement.
- OCR remains English only; blurry/handwritten/multilingual pages and diagrams need review. Accepted OCR is not guaranteed to preserve every visual element. Low-confidence pages fall back to full-page images.
- Word layouts remain approximate (especially nested tables, text boxes, complex scripts and unsupported image types). Word result preview shows extracted text, not a full fidelity layout.
- Password entry currently supports reading. Editing encrypted PDFs is still unsupported by the PDF editing engine.
- Annotation, signing workflows, true redaction, cloud synchronization, additional OCR languages and Play Billing are outside this implementation. This is an improvement of the existing toolkit, not feature parity with Acrobat or dedicated scanning products.
- Production dependencies have no known npm-audit findings at verification time. Three moderate findings remain in the development-only Capacitor CLI dependency chain; the suggested forced downgrade was not applied.
