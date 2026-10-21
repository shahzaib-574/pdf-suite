# Organize selection — local browser validation (2026-10-03)

The actual `#/tool/organize` page accepts one PDF **or** a batch of supported images. Previews use three columns and one bounded scrolling area. Selection starts empty; tap pages in output order, deselect to renumber, or select all in original order. Organize exports only the numbered selection. Individual rotation, repeated Rotate all 90°, and Reverse selected order affect both previews and output.

## Bounded implementation

- Image input uses the existing normalization contract (including filename fallback for missing/generic MIME), up to 200 files / 128 MB. Images are prepared sequentially and converted into one temporary PDF, without library mutation. This is generic image-tool normalization, **not** scan-gallery original-byte preservation; existing resizing/format conversion may apply.
- Mixed PDF/image batches and multiple PDFs are rejected. Invalid replacement or password cancellation preserves the prior valid input and selection. Existing supported PDF password removal is reused; unsupported encryption reports an error.
- Previews use one owned viewer session, serial lazy rendering and at most 32 owned object URLs. Ownership is invalidated synchronously on input removal/unmount and when the originating tool is suspended behind native capture. These resource bounds and late-render URL guards were source-reviewed, not independently allocation-profiled.
- Cancellation is checked before/after each image and before publication. An individual decode/conversion already in progress is not guaranteed to interrupt immediately; cancellation prevents subsequent batch work and stale publication.

## Exact candidate and evidence

Six source/test files are recorded in the local evidence manifest `source6-final-sha256.txt`, SHA-256 **E069572910E300B184E40E69B5C43827063481DE1DB39EDD3041CC8895FD3B44**. Immediate pre-task snapshots/delta patches are preserved separately from the earlier camera/banner work. Evidence resides locally under `.superpowers/sdd/2026-10-03-organize-selection/`; screenshots are synthetic local test artifacts, not public documentation dependencies.

The real product-route regression first failed on the existing two-column layout (`red.log`). The final focused test passed (`final-green.log`): mobile/desktop three-column bounded layout; scrolling to page 40 and rendering its thumbnail; empty/numbered selections; actual exported PDF text order 3→1 and selected-only count; source plus individual/repeated bulk rotation; normalized image output colors blue→red; invalid replacement preservation; wrong password/retry/cancel; suspended-origin password cancellation and selection recovery. The desktop/mobile synthetic screenshots were reviewed, including the square preview correction that prevents quarter-turn clipping.

Fresh commands, run from the workspace root:

| Command | Result / local log |
| --- | --- |
| `node tests/browser/organize-selection-selfcheck.mjs` | PASS — `final-green.log` |
| `npx tsc -b` | PASS — `tsc-final.log` |
| `npm run lint` | PASS, 7 warnings — `lint-final.log` |
| `npm run build` | PASS — `build-final.log` |
| `npm run pdf-selfcheck` | PASS — `pdf-final.log` |
| `npx tsx tests/browser/ui-selfcheck.ts` | PASS, 13/13, no failures/page errors/external requests — `ui-final.log` |
| `git diff --check` | PASS |

Lint warnings: three new owned-resource/reset effects in OrganizeGrid; the prior App focus DOM mutation warning and three Viewer effect warnings remain. Build warnings include chunk sizes and the existing ineffective dynamic import of incoming.ts. No warnings were hidden or converted into a claim of a warning-free build.

Independent scoped read-only review approved all six candidate hashes with no remaining blockers. Primary independently reran the focused organizer test successfully, matched all six final hashes, checked `git diff --check` (exit 0), and verified HTTP 200 at the actual development route. Local browser scope accepted; next step is user feedback.

## Scope / delivery limits

This is a locally validated browser feature, available through the development preview. No native Java, SDK, advertising policy, permissions, Git delivery, Android sync/build/install, emulator state or user draft was changed for this task. The prior installed debug APK does **not** contain this new organizer work. Pixel camera quality, physical-device/provider acceptance and production advertising/release gates remain outside this validation.
