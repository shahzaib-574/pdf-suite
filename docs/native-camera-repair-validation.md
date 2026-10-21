# Native camera repairs — local validation, October 2, 2026

Status: source reviewed for the bounded repair scope; original local/build gates below passed.
Initial emulator validation was partial/failed; the later approved controlled run passed bounded core checks (see the addenda below).
**Pixel 8 camera quality, real provider behavior and physical-device acceptance
remain NOT RUN.** This is a debug-test APK, not a release or deployment.

## Candidate identity

- Workspace: `C:\Users\Macbook Pro 2019\pdf-suite`
- Branch: `codex/tools-inline-banner`; base HEAD:
  `e44538047c410169ff5ebef1220fedc30851118a`.
- Camera changes are uncommitted; no commit, push, install or release signing.
- 26 source/test files are recorded with individual SHA-256 values in the local
  `.superpowers/sdd/2026-10-02-native-camera-repairs/review-source-sha256.txt`.
  Manifest SHA-256 (UTF-8/LF):
  `ACD63572EBB2FB29136F5157DEA830C4F6553591BA1AFA59CE1F94A749FC58E5`.
- Independent source review passed after retained-budget/retake corrections.
  Subsequent source delta: approved error-copy spacing only in `incoming.ts`.
- APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 173801455 bytes,
  written `2026-10-02 12:15:18 UTC`.
- APK SHA-256:
  `B6DCCE08901095E2D828B49C22C5CD9398395BB4D8736B3267E7E894870E1ECB`.
- Read from APK: `com.reampdf.mobile`, versionCode `7`, versionName `1.2.1`.
- Artifact guard confirms `android-debug`, Google test banner only, existing
  UMP/G/under-age consent settings, native banner host, no fixture/DEV placeholder,
  and `TOOLS_INLINE_BANNER_PRODUCTION_VERIFIED=false`. No real ad requests tested.
- Existing original icons, website policies, SDK versions and 16 generated
  output artifacts remain unchanged. Build-generated `android/.kotlin/` is
  excluded evidence/cache, not product source.

## Behavior verified locally

Native JVM tests exercise the actual dedicated copy worker: blocked read/close,
bridge-caller responsiveness, exclusive ownership, actual worker cancellation,
reentry while closing, shutdown/late cancellation, safe provider-close failure,
and retention of files already handed off. Session tests cover cancel-before-
attach, identity-owned detach and terminal completion. Arbitrary providers may
ignore close/cancellation; universal interruption is not claimed.

Pure and real React fixture tests cover StrictMode sharing (one native request),
true unmount/remount and immediate retry after cancellation, gallery success /
cancel / error / Back, stale events and late results, and abort during an
unresolved chunk read. The fixture uses typed internal dependencies; product
wrappers use native transport with no query/global mock bypass. An older native
transport cannot be certified to cancel a stalled provider; JS stale-result
suppression and best-effort cleanup do not prove provider resources released.

Synthetic browser tests verify full-byte JPEG/PNG preservation at 4032x3024,
EXIF-6 preservation/oriented decoding, scan-gallery rejection above 32 MP,
unchanged generic 3200-pixel normalization, mixed-conversion retained-byte caps,
and empty/abort handling. Real ToolFlow and browser-camera tests reject repeated
65 MB additions; parent retake with existing 65+55 MB pages rejects a 75 MB
replacement, displays the 128 MB error, and Back preserves both original pages.
Existing fidelity tests verify all eight EXIF orientations, full-resolution
color crop and PDF alignment. No user photographs are used or saved as evidence.

## Exact local commands and results

Run from the workspace unless indicated. Detailed `final-*.log` files are local
under `.superpowers/sdd/2026-10-02-native-camera-repairs/`; these are not hosted
artifacts. Tests use the existing local Vite preview at `http://127.0.0.1:5173`.

| Command | Result / log |
| --- | --- |
| `npx tsx scripts/camera-flow-selfcheck.ts` | exit 0; `final-camera-flow-selfcheck.log` |
| `npx tsx scripts/gallery-import-selfcheck.ts` | exit 0; `final-gallery-import-selfcheck.log` |
| `npx tsx scripts/document-capture-selfcheck.ts` | exit 0; `final-document-capture-selfcheck.log` |
| `npx tsx scripts/scan-budget-selfcheck.ts` | exit 0; `final-scan-budget-unit.log` |
| `npx tsx scripts/inline-banner-selfcheck.ts` | exit 0; `final-inline-banner-selfcheck.log` |
| `node tests/browser/native-camera-selfcheck.mjs` | exit 0; `final-native-camera-selfcheck.log` |
| `node tests/browser/native-camera-repairs-selfcheck.mjs` | exit 0; `final-native-camera-repairs-selfcheck.log` |
| `node tests/browser/native-camera-flow-selfcheck.mjs` | exit 0; `final-native-camera-flow-selfcheck.log` |
| `node tests/browser/scan-budget-selfcheck.mjs` | exit 0; `final-scan-budget-browser.log` |
| `npm run product-quality-selfcheck` | exit 0, all five scripts; `final-product-quality-selfcheck.log` |
| `npm run browser-selfcheck` | exit 0; 13 UI flows + edge checks + 8 engine checks; `final-browser-selfcheck.log` |
| `npm run pdf-selfcheck` | exit 0; `final-pdf-selfcheck.log` |
| `npm run docx-selfcheck` | exit 0, DOCX + PDF/Word fidelity; `final-docx-selfcheck.log` |
| `npm run quality-selfcheck` | exit 0; `final-quality-selfcheck.log` |
| `npm run dependency-selfcheck` | exit 0; `final-dependency-selfcheck.log` |
| `npm run ads-selfcheck` | exit 0; `final-ads-selfcheck.log` |
| `npm run lint` | exit 0, 3 existing Viewer warnings; `final-lint.log` |
| `npx tsc -b` | exit 0; `final-tsc.log` |
| `npm run build` | exit 0; `final-build.log` |
| `npm run build:website` | exit 0; `final-build-website.log` |
| `npm run android:sync:debug` | exit 0; `final-android-sync-debug.log` |
| `npm run verify:ads -- --debug` | exit 0; `final-verify-ads-debug.log` |
| Gradle command below | exit 0; 50 JVM tests, 0 failures/errors; instrumentation COMPILED ONLY; lint 0 errors / 35 warnings; debug APK assembled; `final-gradle.log` |
| `node scripts/tools-banner-proof-artifact-selfcheck.mjs` | exit 0; `final-apk-testads-proof.log` |
| `npm run verify:android-artifact -- --print-artifact-identity android/app/build/outputs/apk/debug/app-debug.apk` | exit 0, identity only (not release acceptance); `final-apk-identity.log` |
| SDK `aapt2 dump permissions android/app/build/outputs/apk/debug/app-debug.apk` | exit 0; `final-apk-permissions.log` |
| `git diff --check` | exit 0; `final-diff-check.log` |

For fixture browser gates, `REAM_TEST_URL` was set to
`http://127.0.0.1:5173/tests/browser/fixtures/native-camera-flow.html` (other
product suites use their existing product routes). Native final command:

```powershell
$env:JAVA_HOME='C:\Users\Macbook Pro 2019\jdk-21\jdk-21.0.12.1+1'
$env:ANDROID_HOME='C:\Users\Macbook Pro 2019\Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
cd android
.\gradlew.bat :app:testDebugUnitTest :app:compileDebugAndroidTestJavaWithJavac :app:lintDebug :app:assembleDebug --rerun-tasks
```

Warnings retained, not hidden: 3 Viewer set-state-in-effect warnings; 35 Android
lint warnings (icons/resources/accessibility/constructor/order/translation/SDK
categories, not all claimed new); Gradle/plugin deprecations, flatDir and
experimental resource shrinking; dependency Kotlin nullable/deprecated APIs;
unstripped native libraries; web chunk-size/ineffective-dynamic-import warnings;
PDF standard-font-data warnings. Broad browser log includes Vite WebSocket
connection warnings, while UI reported zero page errors/failures and all gates
exited 0. No dependency/SDK upgrade or unrelated warning cleanup was performed.

## External gates and diagnostic limits

The exact reported Pixel 8 Original/color quality cause is still unproven:
original still bytes and color/PDF resolution are preserved locally. Bound still
resolution, JPEG dimensions/EXIF and focus outcome diagnostics are now available
for comparison; CameraX selection/high-res policy was deliberately not changed.
The exact provider/device gallery hang has not been physically reproduced.
Explicit stages, off-bridge copying and owned cancellation address evidenced
flow/resource defects, not a universal device guarantee.

Physical camera/shutter, cloud download/close behavior, permission/lifecycle /
rotation on Pixel 8 and instrumentation execution are NOT RUN. Follow the Pixel
checklist in [native-document-camera.md](native-document-camera.md). A native
camera update requires a new installed Android binary; no OTA/store/deployment
was performed. Production ad enablement remains unapproved and disabled.

## Independent primary verification

Primary reran JVM tests with `--rerun-tasks` (109 tasks, 27 seconds): 50 tests,
0 failures/errors. All four pure camera/gallery/capture/budget checks,
TypeScript and the three new real-browser checks passed independently. All
26 source entries matched the final source manifest; APK SHA-256 was unchanged.
Independent artifact checks confirmed packaged NativeImportWorker,
NativeCameraSession, DocumentCameraPlugin and safe diagnostic tags, gallery
phase UI and retained-budget guards, no fixtures, test ads and production flag
false. Source review and local-build acceptance passed; physical gates above
remain NOT RUN. No additional implementation changes followed this receipt.

## Emulator follow-up — partial/failed

User-authorized emulator testing was attempted after the original local review.
One package instrumentation test passed; the native shutter result test failed
at its 45-second harness deadline despite a saved-JPEG diagnostic. Recurrent
system/SystemUI ANRs also appeared on a fresh isolated instance before Ream
installation. No product code or test timeout was changed. Actual gallery /
crop / PDF on emulator remains NOT TESTED, and Pixel/cloud acceptance NOT RUN.
See [native-camera-emulator-validation.md](native-camera-emulator-validation.md)
for exact results, isolation, metadata-cache change and cleanup evidence.

## Later approved emulator core pass and visible handoff

The original failed emulator receipts remain historical. A subsequent approved
host-load-controlled run passed health, unchanged targeted native 2 tests, real
gallery byte/dimension preservation, ordinary crop/PDF export, picker cancel /
retry and actual app capture callback. See the updated
[native-camera-emulator-validation.md](native-camera-emulator-validation.md)
for exact receipts, harness-error corrections, limits and separate visible QA
window. Pixel quality and cloud-provider behavior remain unverified. Product
source and debug APK hashes are unchanged; no production enable/commit/push.

## Approved launch/crop preview follow-up

Both bounded UI fixes are built and locally verified in debug APK D4CE5E...
but NOT installed: the fresh guard found an active native camera and preserved
the user's work. See [native-camera-preview-ux-validation.md](native-camera-preview-ux-validation.md)
for scoped baselines, RED/GREEN, exact artifact identity and safe handoff status.
