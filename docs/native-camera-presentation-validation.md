# Native camera presentation — October 3, 2026

**Reviewed, locally verified, built and installed on the persistent QA emulator.**
This removes the standalone Back-only/blank web transition, not Android hardware
initialization time. Previous native camera quality/provider repairs remain unchanged.

## Scope and review

Five product files: App, ToolFlow, ScanCamera, NativeScanCamera and one compact
cancel-button CSS rule. Existing NativeView test has two pending-button label
changes; three new fixture/test files exercise the actual App/ToolFlow parent.
Shipping App selects the native adapter only; isolated typed fixtures have no
production query/global/plugin bypass. Origin/editor remains visible and inert;
pending capture uses a focused compact cancel control. Gallery/error/retry remain
explicit. Draft restore precedes capture; success enters crop, cancel restores
origin/editor, and stale callbacks cannot reclaim a newer route.

Immediate baselines and detailed evidence are local under
`.superpowers/sdd/2026-10-03-native-camera-presentation/`.
Corrected nine-file source manifest SHA-256:
`162BC5F5D4CF326B6C82FE1272B2FB5669B8A1030D07667D0B0B7000DD84527E`.
Independent review and primary focused reruns approved this exact source.

## RED / GREEN and local gates

- Actual parent RED: Settings disappears during launch. GREEN: retained origin
  through held launch and held returned-photo read, then crop directly.
- Viewer pending cancel-focus RED; GREEN focused portal cancellation and narrow
  window-shortcut isolation. Home/Settings/Recents/Viewer, add/retake, existing
  draft restoration, delayed-draft cancellation, permission error/retry/gallery,
  StrictMode one capture, Back/late events and browser fallback pass.
- Direct-entry history RED leaves depth 1; GREEN depth 0 fallback replacement.
- Review RED: settled aborted Merge remains permanently busy after camera cancel.
  GREEN: separate component lifetime from active publication, settle busy while
  retained/inactive; retry available without stale job navigation.
- Genuine Home scroll 400 and origin/recreated-navigation focus restore. Existing
  editor remains visible during a held post-result read, retaining pages/edits.
- Actual Home DEV-only neutral placeholder is present before capture and absent
  while retained Home is pending, proving banner ineligibility. Temporary 5175
  server stopped; standard 5173/5174 stayed preview-flag false.

Fresh commands/results are in `pure-results.json`, `browser-results.json` and
`build-results.json` (all exit 0):

| Gate | Commands |
|---|---|
| Pure | `npx tsx scripts/{camera-flow,document-capture,gallery-import,scan-budget,inline-banner}-selfcheck.ts` individually; `npm run ads-selfcheck`, `dependency-selfcheck`, `quality-selfcheck`, `pdf-selfcheck`, `docx-selfcheck` |
| Parent/view | `node tests/browser/native-camera-presentation-selfcheck.mjs`; isolated `native-camera-flow-selfcheck.mjs`; parent repeated on 5175 with `PRESENTATION_ORIGIN=http://127.0.0.1:5175 EXPECT_BANNER_PREVIEW=true` |
| Browser | `native-camera-repairs-selfcheck.mjs`, `scan-budget-selfcheck.mjs`, `npm run product-quality-selfcheck`, `npm run browser-selfcheck` |
| Fidelity/build | `REAM_TEST_URL=http://127.0.0.1:5173 node tests/browser/native-camera-selfcheck.mjs`; `npm run build`, `build:website`, `android:sync:debug`, `verify:ads -- --debug`; `npx tsc -b`, `npm run lint` |
| Native incremental | Existing JDK21/SDK36, `gradlew.bat :app:compileDebugAndroidTestJavaWithJavac :app:assembleDebug --max-workers=1 --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m`: 1m25s, 166 tasks / 21 executed / 145 up-to-date |
| APK | `node scripts/tools-banner-proof-artifact-selfcheck.mjs`; local `verify-presentation-apk.mjs`; explicit `verify-android-artifact.mjs --print-artifact-identity android/app/build/outputs/apk/debug/app-debug.apk` |

Native source hashes match the previously reviewed camera manifest. Historical
fresh 50 JVM tests / 0 failures remain unchanged-native evidence, **not a fresh
JVM rerun here**; instrumentation compiled, not rerun. Historical native lint
35 warnings / 0 errors was not rerun. Current JS lint: 3 existing Viewer warnings
plus an intentional DOM heading `tabIndex` focusability immutability warning,
0 errors. Existing web chunk/import and Gradle deprecation warnings remain.

Wrong selector/URL/short-page animation measurements are retained as harness
errors, not app failures. One artifact verifier call defaulted to an old release
APK 6/1.2.0 and failed; `apk-identity-wrong-default-release.log` is preserved.
The corrected explicit debug identity below passes; no release was changed.

## Exact installed debug artifact

- `android/app/build/outputs/apk/debug/app-debug.apk`, 174181187 bytes.
- SHA-256 `00AA99695F42F1CF921B3B60003D8BFABE9198BE973D000ADCCB19E25329873E`.
- Package `com.reampdf.mobile`, versionCode 7 / versionName 1.2.1.
- Google test-ad debug metadata, TFUA/G unchanged, production gate false,
  no fixture/DEV-placeholder entries; crop fill remains none with outline.
- Exact same persistent CameraRepairQAVisible/emulator-5554/user0. Immediately
  before/after install: idle Home, no draft/library rows/job/picker. `install -r`
  succeeded in 4.990 seconds; installed base APK SHA matches exactly. No wipe,
  uninstall, profile replacement, release signing, Git or production-ad action.

## Actual emulator observations (distinct from held React tests)

- Real native Activity entry: WebView URL scan, Home DOM/layout retained,
  enabled compact cancel, no standalone camera section/Back-only page, creative 0.
- Native Back returns Home directly; no draft created by cancel.
- Own **emulated**, not webcam/Pixel, camera capture: pending Home observed at
  3910 ms and crop at 6397 ms. No standalone transition section. These are polling
  observations, not an exact native latency benchmark or a forced held-read test.
- Actual crop computed fill none, stroke 0.5px, 4 corner handles. Screenshot
  `emulated-capture-crop.png` contains only the SDK synthetic camera scene.
- Own 1-page draft saved; ordinary MainActivity reopen retains 1 page and the
  same metadata timestamp. Initial diagnostic used the wrong split-storage key
  and wrong handle selector; receipts retained, corrected count/style receipts
  replace those interpretations. No native-cache byte-identity claim.
- Initial post-install CDP used a closing old socket during startup; receipt
  preserved, verified new process socket subsequently responded.

The VM later exited normally before final inspection; parent exit 0 / exit request
recorded, closer/cause unknown. Failed empty `final-live-state.json` is preserved.
One ordinary same-profile relaunch reused existing data without initdata/wipe or
reinstall. Latest `final-live-state-reopened.json` verifies booted QA user 0,
qemu 44956 / visible window 12125754 / launcher 45644 / parent 70099, and the
user subsequently opened DocumentCameraActivity. Their current camera/draft was
not interrupted. Post-VM-relaunch draft comparison was not measured; no loss or
equality conclusion. All owned forwards/temporary preview cleaned up; 5173/5174
HTTP 200, visible user window/data and 16 existing output artifacts preserved.

Pixel 8/OEM quality, cloud-provider specifics and durable emulator stability are
still unverified. No claim of zero hardware startup delay or production readiness.
