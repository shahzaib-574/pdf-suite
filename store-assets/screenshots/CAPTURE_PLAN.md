# Real Android screenshot capture plan

Capture the release candidate itself. Do not substitute design mockups.

## Capture setup

- Install the signed release candidate or the exact internal-track build on an API 36 Android emulator for the guarded workflow below. Physical-device captures require a separate manual capture path and must still pass `-ValidateOnly`.
- Use a 1080 x 1920 portrait viewport for all phone images.
- Set display/font scaling to the Android defaults and keep one theme across the core sequence.
- Use the canonical synthetic fixture at `../fixtures/ream-screenshot-fixture.pdf`. It contains five non-confidential pages with varied text, a ruled table, two columns, and mixed orientation.
- Remove developer overlays, notifications, personal account details, file paths, and service-provider names.
- Show complete system status icons or crop the status bar consistently; never edit app content into the capture.
- Capture the actual ad-free release build after device QA; do not fabricate app content.
- Export each screenshot as a 24-bit RGB PNG with no alpha.

Copy the canonical fixture into the emulator's Downloads directory before the
capture session, adjusting the serial when needed:

```powershell
adb -s emulator-5554 push store-assets/fixtures/ream-screenshot-fixture.pdf /sdcard/Download/
```

The tracked fixture is deterministic. Install its pinned generator runtime once,
byte-verify the committed PDF, and regenerate it only from the repository script.
Then run `npm run pdf-selfcheck` and visually review every rendered page:

```powershell
python -m pip install -r store-assets/scripts/requirements-screenshot-fixture.txt
python store-assets/scripts/generate_screenshot_fixture.py --check
python store-assets/scripts/generate_screenshot_fixture.py
npm run pdf-selfcheck
```

## Guarded Windows capture workflow

Use the repository helper instead of shell redirection, browser screenshots, or
mockups. It reads the emulator framebuffer through `adb exec-out screencap -p`,
checks that the selected device really is an emulator, requires an effective
1080 x 1920 portrait size, default font scale, and no display-density override,
requires API 36 and the non-debuggable `com.reampdf.mobile` build, and verifies
that Ream is foregrounded before every capture. The installed `versionCode` and
`versionName` must exactly match `android/variables.gradle`; override those
expectations only when intentionally checking another release with
`-ExpectedVersionCode` and `-ExpectedVersionName`. Android RGBA output is accepted
only when every alpha value is fully opaque, then saved losslessly as a 24-bit
RGB PNG.

From the repository root, start the target AVD, install the signed release
candidate or internal-track build, and run:

```powershell
pwsh -File store-assets/scripts/capture_android_screenshots.ps1
```

The helper walks through all six states below. Navigation and fixture selection
remain manual so every stored pixel comes from the actual release candidate.
Use `-State 3` (or `-State 2,3,5`) to capture selected states. When more than one
AVD is connected, use `-Serial emulator-5554`. If `adb.exe` is not on PATH, pass
its full path with `-AdbPath`. The helper also resolves `apksigner` from installed
Android SDK Build-Tools; pass `-ApksignerPath` only when automatic discovery does
not find it. `apksigner` verifies the installed base APK and supplies the signing
certificate SHA-256 digest used for provenance.

After each successful capture, the helper atomically creates or updates
`capture-provenance.json`. It records the package and exact version, API level,
emulator manufacturer/model/device name and serial, UTC capture time, signing
certificate SHA-256, installed base-APK SHA-256, and a SHA-256 for every covered image. Partial capture runs
may extend the same manifest only with the same emulator identity, app version,
and signing certificate. Use a new empty output directory when any of those
change; existing screenshots without a manifest are intentionally not adopted.

The helper refuses to overwrite a capture. Move an existing image aside only
after reviewing it, or validate the current set without connecting a device:

```powershell
pwsh -File store-assets/scripts/capture_android_screenshots.ps1 -ValidateOnly
```

Validation decodes each requested PNG and checks its exact filename, dimensions,
8-bit RGB channel format, and absence of alpha/transparency. When
`capture-provenance.json` exists, validation also checks its package/version/API
metadata, APK/signing identity, validates every covered image, verifies every recorded image SHA-256,
and requires every requested image to be covered. A missing manifest produces a
warning because legacy images can still pass pixel validation, but they do not
pass the provenance gate. The script does not navigate the app, seed data, resize
the AVD, crop pixels, or edit visible content.

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
- [ ] `capture-provenance.json` passes `-ValidateOnly` and covers every image selected for upload.
- [ ] Every advertised action is available in the uploaded build.
- [ ] No personal, client, or copyrighted document content is visible.
- [ ] Text is readable at Play Store thumbnail size.
- [ ] Navigation and action labels are not covered by system UI or ads.
- [ ] Images are sharp, consistently oriented, and not stretched.
- [ ] Final alt text is recorded in `ALT_TEXT_TEMPLATE.md`.
