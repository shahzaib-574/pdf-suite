# Real Android screenshot capture plan

Capture the release candidate itself. Do not substitute design mockups.

## Capture setup

- Install the signed release candidate or the exact internal-track build on an API 36 Android phone/emulator.
- Use a 1080 x 1920 portrait viewport for all phone images.
- Set display/font scaling to the Android defaults and keep one theme across the core sequence.
- Use a synthetic, non-confidential PDF fixture with varied text, one table, and several pages.
- Remove developer overlays, notifications, personal account details, file paths, and service-provider names.
- Show complete system status icons or crop the status bar consistently; never edit app content into the capture.
- Do not show test ads. Capture the production presentation only after consent and ad behavior have passed QA, or use an approved screenshot build that hides the ad placement without changing app content.
- Export each screenshot as a 24-bit RGB PNG with no alpha.

## Required phone sequence

1. `01-tools-home-1080x1920.png` — Tools home with search, categories, and the first useful tool cards visible.
2. `02-scan-intake-1080x1920.png` — Scan flow after adding a synthetic page, with the next action visible.
3. `03-pdf-to-word-1080x1920.png` — PDF to Word flow showing the selected fixture and a clear conversion action.
4. `04-pdf-reader-1080x1920.png` — Reader showing the synthetic document, page controls, and search or outline affordance.
5. `05-organize-pages-1080x1920.png` — Organize flow showing multiple real thumbnails and reorder/remove controls.
6. `06-recents-1080x1920.png` — Recents with generated PDF and DOCX outputs and usable open/save actions.

The first four images are the minimum recommended set for app discovery surfaces. Keep the strongest, clearest UI in the first three positions.

## Review before upload

- [ ] Every image is a direct capture of the current release candidate.
- [ ] Every advertised action is available in the uploaded build.
- [ ] No personal, client, or copyrighted document content is visible.
- [ ] Text is readable at Play Store thumbnail size.
- [ ] Navigation and action labels are not covered by system UI or ads.
- [ ] Images are sharp, consistently oriented, and not stretched.
- [ ] Final alt text is recorded in `ALT_TEXT_TEMPLATE.md`.
