# Ad-free internal testing

This branch removes the ad SDK, startup/consent flow, Settings privacy-choice controls, native ad resources, reserved banner spacing and ad-specific release prerequisites. Privacy and listing copy now describe the ad-free build. Signing, package identity and SDK requirements remain enforced.

## Obtain a test build

Local prerequisites: Node 22+, JDK 21, Android SDK 36. Run `npm ci`, `npm run android:sync`, `npm run verify:ad-free`, then `android/gradlew.bat --no-daemon lintDebug testDebugUnitTest assembleDebug` from the Android directory (use `./gradlew` on Linux/macOS). The debug APK is for sideloading only, not Play upload.

Alternatively, after the reviewed changes reach GitHub, run **Build ad-free internal test APK** (`internal-test.yml`). It requires no signing or ad secrets and provides a sideload-only debug APK plus Android reports. A debug-signed APK may not install over an existing release signed with another key; use a separate test device/profile and preserve existing local documents.

For a Play internal-track upload, use the signed AAB workflow described in [signed AAB](android-production-aab.md), with the app's upload key. This setup has not pushed code, run remote workflows, uploaded a bundle, or changed Play Console.

## Device acceptance matrix

Use synthetic documents and record device model, Android/WebView version, build commit, elapsed time and outcome. Test a low-memory Android phone, a current Android phone, and a tablet or large display. Include the minimum supported Android API 24 where available.

- Install/cold-start/reopen: no ad network requests, consent dialogs or empty banner gap; launch and navigate offline.
- Each of 13 tools: process a normal file, verify actual output in another PDF/Word/image app, cancel mid-job, retry and save/share.
- Reader: correct/incorrect passwords, large documents, search before/after indexing, mixed page sizes, zoom and orientation changes.
- Scan: allow/deny camera, gallery fallback, corner dragging, rotation, each enhancement, restore original, multiple pages and ordering.
- Results/library: 9 MB retained document, 41-image ZIP, rename/delete, storage failure, cancellation of Android's save/share sheet.
- Incoming files: cold and warm VIEW/SEND/SEND_MULTIPLE from Files and a sharing app; mixed unsupported files; a new share while another operation runs.
- Conversion quality: English scan, blurred scan, selectable-header + scanned body, tables, columns, images, Greek/Cyrillic text, unsupported scripts. Compare names, numbers and diagrams with the original.
- UI: small screen, 200% text, light/dark, TalkBack, reduced motion, keyboard focus, app background/foreground and rotation during a job.
- Low memory: large photo, many-page document, input-size limits; verify clear recovery instead of crashes or false success.

Record failures before promoting the build. Do not infer OCR accuracy, battery efficiency, or production readiness from unit tests.

## Browser verification completed

A fresh headless Chrome profile passed 25 checks: all 13 tool UI flows and downloads, eight rendering/OCR checks, and four cancellation/library/responsive groups. See [browser QA results](browser-qa.md). Run `npm run dev` on 127.0.0.1:5173, then `npm run browser-selfcheck` with Chrome installed. Set CHROME_PATH for another compatible executable. Test artifacts go to ignored `tmp/browser-qa/`.

## Current environment limits

The built-in browser tools could not initialize, so tests used the project's isolated Playwright/Chrome runner. No personal browser profile was used. Java/Android SDK are not configured, and no Android device results are available. An Adoptium lookup returned HTTP 403; Microsoft JDK and Google SDK download endpoints were reachable, but toolchain installation was deferred when the user requested browser testing. Android build, camera hardware and native save/share acceptance remain pending.
