# Browser QA — 5 September 2026

Tested the working ad-free app in a fresh, headless installed Chrome profile using Playwright. Synthetic documents only. Tests target the local Vite app at 127.0.0.1:5173; these are desktop-browser measurements, not Android performance benchmarks.

## Passed

- All 13 tools: merge, split, images → PDF, scan (gallery path and adjustment), compress, organize, watermark, page numbers, protect, PDF → images, Word → PDF, PDF → Word and reader.
- Generated files actually downloaded. PDFs were parsed, image ZIPs were inspected, and Word output was checked for the source customer reference. Protected PDF password retry and successful opening were exercised in the UI.
- Eight browser engine cases: first-page session before search indexing, wrong/correct password retry with spaces, complete 41-image ZIP, cancellation, non-enlarging preserve-text compression, mixed selectable-header/scanned-body English OCR, perspective/black-white adjustment, OCR DOCX → PDF round trip.
- Four edge groups: Cancel releases the modal focus lock and keeps inputs; 41-image export downloads with the edited name; Recents search/rename/delete; dark Settings at 320px and 1440px. Result layout had no horizontal overflow at 320px.
- The 13-tool run recorded zero uncaught page errors and zero external HTTP requests. This does not certify native SDK behavior.

## Fixed from visual inspection

New filename/page-selection fields and the Recents search field lacked the existing input styling. They now use the same 48px minimum height, theme colors and borders as other fields. Select text inherits the theme, and single-page results use singular wording.

## Synthetic timings from one engine run

- First-page session available before indexing: 654 ms.
- 41 small text pages exported at 1x JPEG: 1,135 ms; ZIP 143,931 bytes.
- Mixed scanned/text page → Word OCR: 2,717 ms; customer SN12345 and amount 1240 preserved.

These are single-run observations, include local development conditions, and do not establish a speedup or general OCR accuracy. Preserve-text compression correctly kept the original 9,112 bytes when rewriting offered no reduction.

## Reproduce and inspect

Run `npm run dev`, then `npm run browser-selfcheck`. Chrome must be installed; CHROME_PATH optionally selects its executable. Scripts are in `tests/browser/`. Screenshots, downloaded files and JSON/text reports are written to `tmp/browser-qa/`.

The first engine attempt was interrupted by Vite's development reload and timed out. The dedicated engine runner disconnects the development reload WebSocket; the subsequent eight checks passed. Vite may log expected development-WebSocket errors in this harness; uncaught page errors still fail the test. Two library test selectors were corrected to the actual button labels (Save name and Remove local copy); these were harness errors, not application failures.

## Not established

Physical camera behavior, Android incoming intents/system Save/Share, Android low-memory recovery, min-SDK WebView compatibility, TalkBack, system large-text behavior, real handwriting/multilingual OCR, complex Word fidelity, battery use and production signing are still unverified. The app is ready for the next Android internal-test stage, not certified for public release.
