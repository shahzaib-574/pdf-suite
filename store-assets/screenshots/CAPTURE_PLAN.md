# Real Android screenshot capture plan

Capture the release candidate itself. Do not substitute design mockups.

## Capture setup

- Install the signed release candidate or the exact internal-track build on an API 36 Android emulator for the guarded workflow below. Physical-device captures require a separate manual capture path and must still pass `-ValidateOnly`.
- Use a 1080 x 1920 portrait viewport for all phone images.
- Set display/font scaling to the Android defaults and keep one theme across the core sequence.
- Use a synthetic, non-confidential PDF fixture with varied text, one table, and several pages.
- Remove developer overlays, notifications, personal account details, file paths, and service-provider names.
- Show complete system status icons or crop the status bar consistently; never edit app content into the capture.
- Do not show test ads. Capture the production presentation only after consent and ad behavior have passed QA, or use an approved screenshot build that hides the ad placement without changing app content.
- Export each screenshot as a 24-bit RGB PNG with no alpha.

## Guarded Windows capture workflow

Use the repository helper instead of shell redirection, browser screenshots, or
mockups. It reads the emulator framebuffer through `adb exec-out screencap -p`,
checks that the selected device really is an emulator, requires an effective
1080 x 1920 portrait size, default font scale, and no display-density override,
requires the non-debuggable `com.reampdf.mobile` build, and verifies that Ream is
foregrounded before every capture. Android RGBA output is accepted only when every
alpha value is fully opaque, then saved losslessly as a 24-bit RGB PNG.

From the repository root, start the target AVD, install the signed release
candidate or internal-track build, and run:

```powershell
pwsh -File store-assets/scripts/capture_android_screenshots.ps1
```

The helper walks through all six states below. Navigation and fixture selection
remain manual so every stored pixel comes from the actual release candidate.
Use `-State 3` (or `-State 2,3,5`) to capture selected states. When more than one
AVD is connected, use `-Serial emulator-5554`. If `adb.exe` is not on PATH, pass
its full path with `-AdbPath`.

The helper refuses to overwrite a capture. Move an existing image aside only
after reviewing it, or validate the current set without connecting a device:

```powershell
pwsh -File store-assets/scripts/capture_android_screenshots.ps1 -ValidateOnly
```

Validation decodes each requested PNG and checks its exact filename, dimensions,
8-bit RGB channel format, and absence of alpha/transparency. The script does not
navigate the app, seed data, resize the AVD, crop pixels, or edit visible content.

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
