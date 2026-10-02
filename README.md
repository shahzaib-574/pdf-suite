# Ream - PDF Suite

On-device PDF tools for web and Android. Files never leave the phone or browser. The Android app ID is `com.reampdf.mobile`.

Public privacy policy:
<https://shahzaib-574.github.io/pdf-suite/privacy.html>

## Canonical repository

This repository is the canonical source for the Ream Android and web app.
`ream-pdf-updates` is its signed OTA bundle store, not a duplicate source checkout.
See the [29 September 2026 repository and upgrade audit](docs/repository-audit-2026-09-29.md)
for Play identity evidence, linked-worktree status, the current validation blocker,
and prioritized upgrades.

## Stack

- Vite + React + TypeScript
- GSAP (`@gsap/react`) for press/stagger on transforms only
- `pdf-lib` in a Web Worker (merge, split, images→PDF, watermark, numbers, organize, protect, Word→PDF)
- PDF.js on the main thread (view, compress, PDF→images)
- Geometry-aware PDF text extraction and native DOCX packaging (styled runs, spacing, tables, columns, and bundled on-device English OCR)
- Capacitor 8 Android shell targeting Android API 36
- Google Mobile Ads and UMP through `@capacitor-community/admob` 8.1.0
- Mobbin-informed mobile navigation, searchable tools, light/dark themes, and reduced-motion support

## Run

```bash
npm install
npm run dev
```

Open the local URL on your computer or phone (same Wi‑Fi).

## Push an app update (OTA)

For the installed OTA-enabled test APK, run:

```powershell
npm run ota:push:preview
```

Then open Ream online to download the update, fully close it, and reopen to apply it.
See the [OTA publishing guide](docs/ota-updates.md#push-updates) for setup, production publishing, troubleshooting, and changes that require a new APK.

## Current tools

Merge, split, images→PDF (JPEG, PNG, and WebP), scan (camera), compress, organize, watermark, page numbers, Protect (AES-256 user-password lock, on-device), PDF→images, Word → PDF (simplified), and PDF → Word. PDF → Word rebuilds editable margins, styled text, paragraph spacing and indents, real numbered/bulleted lists, ruled or borderless tables, numeric alignment, columns, embedded images, mixed page orientations, and English OCR for scanned pages. The result screen reports which content was rebuilt and warns when a page required an image fallback.

The reader supports continuous lazy-rendered pages, selectable text, document search, page thumbnails, PDF outlines, page jump, zoom/fit controls, mobile pinch gestures, and direct save/share actions.

Recent quality improvements include password entry in the reader, background search indexing, page selection and JPEG/PNG export, text-preserving compression by default, manual scan perspective correction and enhancement, configurable image pages and page numbers, and searchable/renameable/deletable Recents. Android incoming file intents are implemented for PDF, DOCX and shared images.

The local library keeps file bytes separately from its metadata, up to 200 entries / 512 MB subject to available device storage. Inputs are limited to 200 files / 128 MB; image export is limited to 200 pages / 64 MB. Large photos are normalized to a maximum 3200-pixel side; scan adjustments use a maximum 2200-pixel side. Unicode Word output uses bundled Latin/Greek/Cyrillic fonts, with unsupported characters rejected clearly.

See [quality improvements and verification limits](docs/quality-improvements.md) for feature-by-feature changes and outstanding device checks.

## Checks

```bash
npm run lint
npm run dependency-selfcheck
npm run pdf-selfcheck
npm run docx-selfcheck
npm run quality-selfcheck
npm run pdf-docx-preview
npm run ocr-preview
npm run verify:store-assets
npm run ads-selfcheck
npm run verify:ads
npm run verify:monetization
npm run verify:android-artifact -- --self-test
npm run verify:elf-alignment:self-test
npm run build
```

## Android

Requirements:

- Node.js 22+
- Android Studio with Android SDK 36
- JDK 21 (Android Studio's bundled JBR is suitable)

Build and copy the web app into the native project:

```bash
npm run android:sync
```

Open the project in Android Studio:

```bash
npm run android:open
```

Generate a debug APK or release bundle from the command line after Java and the Android SDK are configured:

```bash
npm run android:debug
npm run android:bundle
```

Android 1.2.1 (7) is the next ad-supported maintenance candidate. The local candidate uses one inline-adaptive Android native overlay synchronized to a measured slot after Recent files on Tools only; Recents and all tool flows remain ad-free. The slot reserves no gap until an ad reports its real size and uses Google UMP consent eligibility. Native production display is disabled pending physical-device scrolling/touch/consent acceptance; a new native APK is required, not a web-only OTA. Because the selected Play audience includes 13-15 and 16-17 users and there is no neutral age screen, every UMP/ad request is tagged as under the age of consent and capped at Google's General content rating. COPPA child-directed treatment remains unset because under-13 users are not selected. Document contents remain on-device and are not sent to the advertising SDK. Debug and store-capture builds use Google's test banner; production uses the exact public IDs in `monetization.config.json`. Run `npm run verify:ads` after a production sync, or `npm run verify:ads -- --debug` after `npm run android:sync:debug`.

See [the internal testing guide](docs/internal-testing.md) for build commands, test coverage, and the remaining release gates.

Launcher icons and light/dark splash screens are already generated from `assets/logo.svg`. Use a current Android Studio Image Asset workflow to regenerate them after changing the logo.

For Play Store release, copy `android/keystore.properties.example` to `android/keystore.properties`, point it to an upload keystore stored outside this repository, and replace every example password locally. The release build validates all four signing fields and the keystore path. Signing files and credentials are ignored by Git. Verification CI stages a one-run disposable key and exercises the exact production AdMob configuration without clicking or depending on a live ad; signing files are removed after the job.

After the production AdMob account and upload key are ready, the protected manual
GitHub workflow can produce the signed AAB without committing configuration or
credentials. Follow the exact secret and environment setup in
[`docs/android-production-aab.md`](docs/android-production-aab.md). It only uploads
the AAB and its separate R8 mapping as workflow artifacts; Play submission remains
a separate manual step.

The package ID is permanent after the first Play Console release. Increment `appVersionCode` in `android/variables.gradle` for each upload and update `appVersionName` for user-facing releases. Signing remains mandatory for release builds. The protected manual AAB workflow requires upload-key secrets only and produces artifacts; it does not submit a Play release.

CI also inspects the optimized signed test artifact's final manifest and web assets,
verifies its signature, and runs Android build-tools `zipalign -c -P 16` so newly
introduced dependencies cannot silently expand permissions or regress the Play
requirement for 16 KB page-size devices.

The currently observed Play selection is 13-15, 16-17, and 18+. Play warns that some users in those groups are children depending on country and requires child-appropriate ads. Before rollout, the publisher must confirm those saved groups, publish/test the matching UMP messages, configure child-appropriate ad serving, publish the matching policy, update Contains ads/Data safety, and complete real-device checks. Global under-age-of-consent treatment plus a General content ceiling is conservative implementation evidence, not proof that account-side forms or every served creative comply. Repository checks do not submit Console forms.

## Next

- One-time Pro via Play Billing
- Additional downloadable OCR languages
