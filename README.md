# Ream - PDF Suite

On-device PDF tools for web and Android. Files never leave the phone or browser. The Android app ID is `com.reampdf.mobile`.

Public privacy policy (available after the Pages workflow is enabled on `main`):
<https://shahzaib-574.github.io/pdf-suite/privacy.html>

## Stack

- Vite + React + TypeScript
- GSAP (`@gsap/react`) for press/stagger on transforms only
- `pdf-lib` in a Web Worker (merge, split, images→PDF, watermark, numbers, organize)
- PDF.js on the main thread (view, compress, PDF→images)
- Geometry-aware PDF text extraction and native DOCX packaging (styled runs, spacing, tables, columns, and bundled on-device English OCR)
- Capacitor 8 Android shell targeting Android API 36
- Mobbin-informed mobile navigation, searchable tools, light/dark themes, and reduced-motion support

## Run

```bash
npm install
npm run dev
```

Open the local URL on your computer or phone (same Wi‑Fi).

## Current tools

Merge, split, images→PDF, scan (camera), compress, organize, watermark, page numbers, PDF→images, Word → PDF (simplified), and PDF → Word. PDF → Word rebuilds editable margins, styled text, paragraph spacing and indents, real numbered/bulleted lists, ruled or borderless tables, numeric alignment, columns, embedded images, mixed page orientations, and English OCR for scanned pages. The result screen reports which content was rebuilt and warns when a page required an image fallback.

The reader supports continuous lazy-rendered pages, selectable text, document search, page thumbnails, PDF outlines, page jump, zoom/fit controls, mobile pinch gestures, and direct save/share actions.

Protect is hidden because the bundled `pdf-lib` version cannot encrypt files. It should only be restored after an on-device encryption engine is added.

## Checks

```bash
npm run pdf-selfcheck
npm run docx-selfcheck
npm run pdf-docx-preview
npm run ocr-preview
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

The debug command builds with Google's official test banner ID. Never use live ad
units while developing or testing. Debug builds also support deterministic UMP
EEA, regulated-US, and other-region checks; follow
[`docs/admob-privacy-testing.md`](docs/admob-privacy-testing.md). Before syncing a
production build, create the ignored `.env.production.local` file with the public
production banner unit:

```dotenv
VITE_ADMOB_TEST_MODE=false
VITE_ADMOB_BANNER_ID=ca-app-pub-<publisher-id>/<banner-unit-id>
VITE_ADMOB_AUDIENCE_MODE=ADULTS_ONLY
```

Set `ADULTS_ONLY` only after the publisher has truthfully selected **Ages 18 and
over** in Play Console. The current v1 release gate rejects an unspecified audience;
teen- or child-inclusive distribution requires a fresh Families, consent, ad-SDK,
content-rating, and store-presence review before changing this value.

`npm run android:sync` emits release metadata from the same Vite environment and
copies it with the compiled JavaScript. Every Android release task verifies that
the synchronized assets are a production build, contain a valid non-test banner
ID, and actually include that ID in the JavaScript bundle.

Launcher icons and light/dark splash screens are already generated from `assets/logo.svg`. Use a current Android Studio Image Asset workflow to regenerate them after changing the logo.

For Play Store release, copy `android/keystore.properties.example` to `android/keystore.properties`, point it to an upload keystore stored outside this repository, and replace every example password locally. The release build validates all four signing fields and the keystore path. Signing files and credentials are ignored by Git. Verification CI stages a one-run disposable key and synthetic, non-live AdMob-shaped IDs to exercise the real signed production path without possessing production secrets; the files are removed after the job.

After the production AdMob account and upload key are ready, the protected manual
GitHub workflow can produce the signed AAB without committing configuration or
credentials. Follow the exact secret and environment setup in
[`docs/android-production-aab.md`](docs/android-production-aab.md). It only uploads
the AAB and its separate R8 mapping as workflow artifacts; Play submission remains
a separate manual step.

The package ID is permanent after the first Play Console release. Increment `appVersionCode` in `android/variables.gradle` for every upload and update `appVersionName` for user-facing releases. For a local production build, replace the Google sample AdMob app ID in `android/app/src/main/res/values/strings.xml` with Ream's public AdMob app ID. The manual GitHub workflow instead injects that ID from its protected environment only on the runner; either path prevents the sample ID from reaching a production bundle.

CI also inspects the optimized signed test artifact's final manifest and web assets,
verifies its signature, and runs Android build-tools `zipalign -c -P 16` so newly
introduced dependencies cannot silently expand permissions or regress the Play
requirement for 16 KB page-size devices.

AdMob's `app-ads.txt` crawler checks the website host root, not a GitHub project
subdirectory. Do not add `pdf-suite/app-ads.txt` and assume it is verified. Point the
Play developer website at a domain whose root can serve `/app-ads.txt`, then publish
the exact publisher line supplied by AdMob.

## Next

- One-time Pro via Play Billing
- Additional downloadable OCR languages
- Real password encryption
- ZIP export for PDF→images
