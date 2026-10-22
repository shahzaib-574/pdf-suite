# Camera launch / crop preview UX — October 2, 2026

**BUILT, LOCALLY VERIFIED AND INSTALLED on the existing visible QA emulator.**
An earlier safe-install inspection found a new active DocumentCameraActivity and
correctly stopped without installation. The user then explicitly authorized
restart/update, including interruption of that camera. The final update receipt
below supersedes the earlier NOT INSTALLED status; historical evidence remains.

## Exact scoped changes

- `NativeScanCamera.tsx`: request the existing capture owner in a layout effect
  before the first web paint; camera phase omits web heading/opening status.
  Back remains available even if launch stalls. Gallery phases, errors, retry
  and recovery controls remain. Native permission/CameraX initialization is
  unchanged; no zero hardware-startup delay is promised.
- `screens.css`: only `.ps-scan-editor__image polygon` fill changed from 10%
  primary tint to `none`. Stroke, width, handles, geometry and original source /
  raster processing / PDF export are unchanged.
- Focused fixture/test changes exercise the actual view/controller, not shipping
  mocks, query hooks or new native/controller interfaces.

Immediate pre-UX baselines and old 26/29-file manifests were copied locally under
`.superpowers/sdd/2026-10-02-native-camera-repairs/camera-launch-ux/` before edits.
Independent scoped review approved the opening delta and combined five-file
candidate manifest SHA-256:
`A4EA6E88D9F01DF25555ED8E628F0A1B8CCA66ECB97C50C8932A726E40F80960`.
The previously accepted camera/controller/native work was not redone or altered.

## RED → GREEN behavioral evidence

- Real React committed-layout probe RED: native capture count 0 rather than 1
  before the first paint. GREEN: one shared StrictMode request in layout, no
  launch heading/status committed or painted, Back enabled; selecting/importing /
  reading/normalizing and error/retry/gallery recovery remain visible.
- Pending Back followed by a successful late photo cannot publish/close twice.
  The reader is intentionally entered with an aborted signal so its finally
  cleanup can release obsolete files. A test-only incorrect expectation of no
  reader entry was preserved, then corrected to the existing contract; no
  controller/native change.
- Actual crop view RED: computed SVG fill was 10% primary color. GREEN: fill
  none, real screenshot interior pixel equals untinted source white in light,
  dark and rotated states; original SHA unchanged, outline width/stroke and
  all handles/paired-edge/pointer/rotated drag interactions and Next pass.

## Final local gates

All commands below exited 0 against the combined source; detailed local logs
are in `camera-launch-ux/`. Explicit browser origin was `http://127.0.0.1:5173`.
A first native-camera browser invocation used default 5180 and failed connection;
that environment receipt is preserved, not represented as a product failure.

- Four pure camera/flow/gallery/capture/budget scripts, inline-banner check;
  ads/dependency/quality/PDF/DOCX checks; TypeScript and lint.
- Focused real React and transparent-crop browser checks; existing camera eight
  EXIF/full-resolution fidelity, scan ingestion/budget, product-quality and full
  browser suites. No visible user data was used by these synthetic browser tests.
- `npm run build`, `build:website`, `android:sync:debug`, `verify:ads -- --debug`.
- Existing JDK21/SDK36:
  `gradlew.bat :app:testDebugUnitTest --rerun-tasks` — 50 tests, 0 failures/errors,
  109 tasks / 13m48. Startup needed a new daemon while another was busy; no shared
  daemon was killed. Remaining incremental cached
  `:app:compileDebugAndroidTestJavaWithJavac :app:lintDebug :app:assembleDebug` —
  301 tasks (27 executed) / 3m13. Instrumentation compiled; no new device matrix.
- Debug/test-ad artifact guard and package identity passed; packaged JS lacks the
  old opening caption, CSS has transparent polygon/retained outline; no fixture
  entries, production gate false. Primary independently checked packaged assets
  and reran both focused browser tests successfully.

Warnings retained: 3 existing Viewer lint warnings; Android lint 35 warnings /
0 errors; existing Gradle/plugin/API/Kotlin deprecations/nullability, native-symbol
strip warnings and web chunk/dynamic-import warnings. No unrelated warning fix,
SDK upgrade, production ad enable, release signing, commit/push or deployment.

## Artifact and safe handoff

- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
- SHA-256: `D4CE5E318A19BE9AB365F5020997A8555A7F21BAE345E92984B16D3838D4F087`.
- 174179917 bytes, written `2026-10-02 17:17:58 UTC`.
- Package `com.reampdf.mobile`, versionCode 7 / versionName 1.2.1;
  `android-debug`, Google test banner only, production flag false.
- `preinstall-device.json`: exact CameraRepairQAVisible/emulator-5554/user0,
  DocumentCameraActivity foreground, no current ANR. **NO install performed.**
  No saved-draft content was read or overwritten after that blocking guard.
  This was the earlier blocked attempt, not the later authorized update.

Prior emulator core successes/failures remain separately recorded in
[native-camera-emulator-validation.md](native-camera-emulator-validation.md).
Pixel 8 sensor/OEM quality, cloud-provider behavior and physical acceptance are
still unverified. These fixes remove web launch copy and crop-preview tint;
they do not establish those external causes resolved. No extra fixture was
imported into the user's draft.

## Authorized persistent-profile restart / update

The existing visible VM had already exited when the fresh handoff was inspected.
The same `CameraRepairQAVisible` profile/data under the previously recorded
external TEMP directory was relaunched visibly, without a replacement profile,
userdata template copy, wipe, uninstall, data clear or snapshot deletion.
Exact target remained `emulator-5554`, API 34, QA user 0. Parent session 51192,
launcher PID 40388, qemu PID 8660 and window 5440286 were left running.

- Boot completed; `shell sync` then exact reviewed APK `install -r` succeeded
  in 61.268 seconds. Existing Ream was launched afterward.
- Installed `pm path` base APK `sha256sum` equals the D4CE5E318A19…D4F087 hash
  recorded above. No rebuild, version change, release signing or product edit.
- **Before-update draft metadata NOT MEASURED:** read-only CDP closed during
  startup. After-update read-only metadata reports no persisted draft/pages or
  library rows and no processing/gallery wait. Without a paired before receipt,
  this does not prove before/after equality or establish data loss.
- The current WebView has no crop polygon. Runtime transparent fill/stroke/
  handles are therefore **NOT OBSERVED on the user's screen**; the installed
  exact APK guard and prior real browser pixel/interaction tests prove the
  packaged fix. No saved crop was altered or new fixture imported. The current
  page has no opening camera caption/heading; pending camera launch was not
  repeated merely for another test.
- A subsequent full window read shows a **current SystemUI ANR dialog** while
  Ream MainActivity remains the focused app. This is an emulator system-health
  limitation, not proof of a Ream regression. No dialog dismissal, further
  restart, renderer/RAM change or UI input was performed; no ongoing-health
  success is claimed.
- Owned CDP forward 54541 removed. Both original previews return HTTP 200 and
  remain running. Final resource snapshot: 2412 MiB available RAM / 2.73 GiB
  disk free. No additional build, APK pull or testing was run.

Local receipts in `camera-launch-ux/`: `install-authorized-update.json`,
`launch-updated-ream.json`, `restarted-draft-before-install.json`,
`installed-apk-sha256.json`, `post-update-presence.json`, `post-update-style.json`,
`update-forward-removed.json`, `update-preview-resource-receipt.json` and
`post-update-window-state.json`. The visible window and persistent QA data are
left for the user; earlier core tests and failed environment receipts remain.

## Subsequent diagnose / reopen request

The next initial inspection found the previous VM had exited normally (parent
exit 0, no adb device/process); its log recorded a parent exit request. Who
closed it is not established. User-authorized reopening reused the same profile
and installed APK, without reinstall or data changes. The first launch command
had a PowerShell quoted-path token error and failed before guest boot
(`make_ext4fs_from_dir: open: No such file or directory`, exit -1073741819).
This is an execution-harness error, not an app failure. File timestamps remained
before that attempt. The primary approved one corrected token-checked launch;
the failure receipt was retained, no third VM cycle was performed.

The corrected visible launch (parent session 91837, launcher 29252, qemu 36480,
window 4458050) reused existing data/cache/SD paths with no initdata/wipe. Fresh
current-boot events showed SystemUI service and GMS SIM-state receiver ANRs.
Targeted own-QA traces show SystemUI main waiting in Binder `publishService`
and GMS main in `serviceDoneExecuting`, both toward ActivityManager. These are
stock-service/server waits, not Ream stacks; the underlying server-delay cause
is not fully established. Boot guest CPU was high. Later reclaim/swap counters
are cumulative, not proof of a single current memory cause; `dumpsys cpuinfo`
also explicitly describes an earlier boot sample, not current load.

Fresh Android screenshot/XML identified only the non-destructive Wait button;
it was selected once, followed by a bounded wait and normal MainActivity start.
At 18:30 UTC the Android screenshot shows real Ream Home without an ANR dialog.
The user then opened the native camera. Three read-only samples spanning
31.8 seconds at 18:31:53–18:32:25 UTC show DocumentCameraActivity foreground,
no ANR focus, and adb response times 558/643/750 ms. No Back, crop alteration,
new fixture or further UI input was performed after the user's camera opened.
This establishes reopening/current responsiveness, not durable stability.

Host snapshot at 18:30: CPU 66%, 1497 MiB available RAM, 4465 MiB commit-visible
headroom; both previews HTTP 200. Current guest top during user camera activity
shows approximately 290% of four-core CPU in use, 226448 KiB free / 1073576 KiB
cached and 354560 KiB swap used. Those observations warrant monitoring, not a
renderer/RAM/product change. No previews were paused, no shared process killed,
no new CDP forward created. All bounded monitors finished; the visible VM,
user camera/data and previews remain running. No product/build/Git changes.

Receipts are under local `emulator/reopen-diagnosis/`: initial-state,
launch-harness-failure, failed-launch-data-metadata, corrected-argument-tokens,
corrected-relaunch-identity, current-boot-anr-events, focused ANR trace JSON,
current-anr-ui.xml/current-anr-dialog.png, wait-once, final-android-screen.png,
foreground-30s, final-current-top and final-host-previews. Earlier installation,
environment failures and physical-device limits remain unchanged.
