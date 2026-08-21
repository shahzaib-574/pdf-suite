# Ream - PDF Suite

On-device PDF tools for web and Android. Files never leave the phone or browser. The Android app ID is `com.reampdf.mobile`.

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

Merge, split, images→PDF, scan (camera), compress, organize, watermark, page numbers, PDF→images, Word → PDF (simplified), and PDF → Word (styled text, spacing, tables, columns, and English OCR for scanned pages).

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

Launcher icons and light/dark splash screens are already generated from `assets/logo.svg`. Use a current Android Studio Image Asset workflow to regenerate them after changing the logo.

For Play Store release, use **Build → Generate Signed Bundle / APK** in Android Studio, select Android App Bundle, and keep the upload keystore outside this repository. The Android project ignores `*.jks`, `*.keystore`, and `keystore.properties`.

The package ID is permanent after the first Play Console release. Increment `versionCode` in `android/app/build.gradle` for every upload and update `versionName` for user-facing releases.

## Next

- One-time Pro via Play Billing
- Additional downloadable OCR languages
- Real password encryption
- ZIP export for PDF→images
