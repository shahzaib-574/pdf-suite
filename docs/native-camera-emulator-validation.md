# Native camera emulator attempt — October 2, 2026

**Initial attempt: partial/failed. Later controlled follow-up: bounded core checks passed**
(see the follow-up section below; not physical-device/production acceptance). Product source and the
reviewed debug APK are unchanged. During the initial attempt, real gallery → review/crop → PDF was NOT TESTED
because the installed emulator repeatedly showed system-level ANRs. The exact
Pixel 8 quality and provider-specific hang remain unresolved/unverified.

## Identity and safety

- Targeted only `emulator-5554`; no physical devices were attached or touched.
- Installed emulator 37.1.11, API 34 Google APIs x86_64 image; emulated back
  camera, configured 2 GB RAM. AEHD 2.2 reported installed and usable.
- Existing ReamPhone booted headless, hidden, `-read-only -no-snapshot-load
  -no-snapshot-save`; its existing owner data was not used for scan tests.
- Existing package was version 6 / 1.2.0 with WebView IndexedDB present. Only
  presence metadata was inspected, not private documents/photos/names.
- Isolated guest user 10 was created in the disposable read-only overlay.
  The reviewed debug and rebuilt test APKs installed with `adb install -r`:
  both succeeded, no signature conflict. No uninstall/data clear occurred.
- Guest was verified RUNNING_UNLOCKED; target process `u10_a195`. Installed
  product identity: `com.reampdf.mobile`, version 7 / 1.2.1.
- WebView version 113.0.5672.136. Device airplane mode enabled / WiFi disabled
  only in the disposable test context. No host network/virtualization changes.
- No ad clicks, consent forging, native plugin mocks or product changes.

## Observed results

| Check | Observation |
| --- | --- |
| Exact candidate/APK before tests | All 28 then-current file hashes matched; APK SHA below matched |
| `ExampleInstrumentedTest` | PASS: expected package |
| `DocumentCameraActivityTest.nativeShutterReturnsRealJpeg` | FAIL: ActivityScenario result callback did not arrive within its fixed 45000 ms deadline |
| Targeted instrumentation total | 2 tests / 1 failure, 130.691 seconds; NOT a passing shutter gate |
| Safe native camera logs | Bound 1856x1392; saved JPEG 1856x1392, EXIF rotation 90, 61016 bytes, focus not requested |
| Native timing observation | JPEG diagnostic 23 seconds after bind; saved JPEG alone does not prove callback/JS handoff completed |
| Guest WebView read-only counts | `https://localhost`, keyval-store/keyval count 2, scanDraftPresent false; no existing photo content read |
| Guest Android UI | System UI ANR; after one ordinary, fresh-XML-targeted Wait action, Process system ANR appeared |
| Fresh single-user QA context | Boot completed only after initial deadline, then System UI / system ANRs recurred before Ream was installed |
| Real gallery, explicit progress UI, Back/retry, capture → crop/PDF | NOT TESTED end-to-end on emulator |
| Cloud/stalled provider, Pixel 8 sensor/OEM quality | NOT TESTED; emulator cannot establish these |

The first launch's background child ended with its shell lifetime; relaunch kept
an owned parent process waiting. A later `-datadir`-only isolation setup was
aborted before installation when verbose output showed other AVD-derived paths
still referred to ReamPhone. The emulator automatically removed its original
`bootcompleted.ini` cache metadata. Thus original AVD metadata is **not claimed
byte-identical**. No original userdata/media/snapshot images were wiped, copied
for testing or explicitly deleted; read-only isolation was retained.

The corrected final context used entirely session-owned AVD `.ini` and hardware
configuration under the evidence folder, with launch-shell-only
`ANDROID_AVD_HOME`. All resolved userdata/encryption/cache/SD/ram/pstore paths
were QA-local; SDK system/kernel/vendor images were unchanged/read-only.
It used the same installed image and hardware configuration, no downloads,
no original AVD edits and no snapshots. Root independently confirmed late boot,
API 34 and recurring system ANRs with Ream absent. Further retries stopped.

Host metadata during the problematic guest run showed approximately 16 GB total
RAM with 1.8 GB free; the fresh run had about 2.5 GB available during ANRs.
These observations support an environment limitation but do not prove the sole
cause of the shutter-result failure. No product performance tuning or test
threshold changes were made to obtain a green result.

## Reproducible commands and evidence

The owned, exact-serial commands included:

```powershell
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument --user 10 -w -r -e class com.reampdf.mobile.DocumentCameraActivityTest,com.reampdf.mobile.ExampleInstrumentedTest com.reampdf.mobile.test/androidx.test.runner.AndroidJUnitRunner
```

Test APK was refreshed with `:app:assembleDebugAndroidTest`; product APK remained
unchanged. No `connected*` Gradle task was used (avoid automatic uninstall/reset).
Local logs/config/synthetic assets are preserved under
`.superpowers/sdd/2026-10-02-native-camera-repairs/emulator/`:
`targeted-instrumentation.log`, `safe-native-tags.log`, install/build logs,
`initial-webview-counts.json`, UI XML, launch logs, and `owned-avds/` configuration.
These are local evidence, not hosted/public artifacts.

Read-only native WebView inspection used socket
`webview_devtools_remote_10344` and owned loopback ADB forward `55813`. Direct
CDP Runtime.evaluate queried counts only; no state injection/navigation bypass.
The newer Playwright CDP context API was incompatible with this old WebView, so
inspection used the native page's direct CDP socket instead.

A synthetic printed-text/color PNG fixture was generated at 4032x3024, 631974
bytes, SHA-256 `9f0d12cce63ff6f2500603b15074cd12e2fecca3ff2727921bf198af0819252a`.
It was **not imported on emulator**; no preserved-original success is inferred
from this unused fixture. Existing local/browser fidelity gates remain separate.

## Cleanup and next action

Only owned emulator instances were shut down using exact-serial `adb emu kill`;
owned parent sessions exited. The owned forward 55813 was removed; no forwards
remained at final shutdown. QA images/config/evidence and synthetic fixtures are
preserved, not deleted. Original previews, 16 output artifacts and source work
are preserved. No commit/push/install on physical phone/deployment occurred.

Debug APK SHA-256 remains:
`B6DCCE08901095E2D828B49C22C5CD9398395BB4D8736B3267E7E894870E1ECB`.
26 source/test manifest SHA remains:
`ACD63572EBB2FB29136F5157DEA830C4F6553591BA1AFA59CE1F94A749FC58E5`.
Only narrow validation documentation changed after these attempts.

Next acceptance requires a stable emulator or authorized test phone: rerun the
native shutter result gate, then real local-gallery selection/cancel/Back/retry,
raw JPEG/PNG hashes/oriented dimensions, and ordinary crop/PDF UI. Do not claim
Pixel sensor quality or cloud-provider cancellation from emulator camera output.
## Approved load-control follow-up — core checks passed

The user authorized pausing the two confirmed local previews, diagnosis and app
testing. Only the owned Vite listeners were paused; no shared Java/browser
process or Windows setting was changed. A first start-gate sample missed the
5 GiB commit-headroom requirement by approximately 28 MiB: no emulator launched
and previews were restored. After primary approved up to 60 seconds of quiet
sampling, a second pause held three samples with RAM 6.10–6.12 GiB / commit
headroom 5.09–5.10 GiB, CPU 6.1–13.8%, disk 15.42 GiB. The same QA image, software
lavapipe/SwiftShader renderer, CPU/RAM and AEHD were used for the controlled run.
Restarting/pause of preview processes and host workload variation are confounds;
this is suggestive load evidence, not proof that a watcher was the sole cause.

Boot completed in 155958 ms (2m36). Five preserved cold-boot ANR traces identify
four GMS broadcast timeouts and a Bluetooth service timeout, not Ream failures:
main threads waited on ActivityManager binder calls, a GMS file lock/Object.wait,
and Bluetooth stopServiceToken. Guest load was 19.37 on four vCPUs with 99% total
CPU and kswapd 36% CPU at the captured period. This supports stock-service startup
scheduling/reclaim pressure, not a confirmed graphics deadlock or a sole Windows
free-RAM cause. Those historical records are retained.

A diagnostic UTC parsing error falsely reported an eight-minute deadline after
only 205.044 seconds: PowerShell auto-converted JSON to DateTime, then a culture
string reparse lost UTC. The erroneous receipt is preserved and labeled a
harness error. Numeric UTC epoch/monotonic measurement corrected it without
changing the 8-minute/90-second thresholds or native test's 45-second timeout.
The settled run passed a full 90 seconds with no new ANR, valid launcher XML and
three ADB roundtrips of 158/150/135 ms. Primary independently verified the device,
blank app state and health before installation.

### Real Android results (same controlled run)

- Exact reviewed debug and rebuilt test APK installed with `-r`, no data reset.
- Unchanged targeted native shutter + package tests: **OK (2 tests)**, 56.805 s.
  The earlier guest result-timeout failure remains in the historical record.
- Real product Home → DocumentCamera → Gallery → Android PhotoPicker → Add (1)
  → Crop and Edit succeeded. Waiting UI explicitly reported Android gallery
  selection; native safe tags showed selecting/importing/reading boundaries.
- Actual WebView/IndexedDB retained synthetic PNG **631974 bytes**, exact SHA
  `9f0d12cce63ff6f2500603b15074cd12e2fecca3ff2727921bf198af0819252a`,
  **4032x3024**, no conversion source. Original/color preview had natural
  4032x3024 dimensions and `filter:none`.
- Ordinary top-edge drag → Next → Save PDF → Android Downloads SAVE produced a
  saved one-page PDF, **478529 bytes**, SHA
  `1AF9DCA74EAEDE53B8D15C2DD6CEA026123680B3B1BF50F1CEF6AFA52F82404F`.
  Recents contained the one synthetic PDF; the completed scan draft cleared.
- PDF image was **4031x2755**, FlateDecode. The recorded crop coordinates and
  existing pixel-center `(w-1,h-1)`/rounded-edge formula compute exactly those
  dimensions; no 3200-pixel cap. A first diagnostic expected one extra pixel;
  its failing receipt is preserved, with a formula-derived corrected assertion.
- Confirmed PhotoPickerActivity → Android Back returned Home preserving the PDF;
  retry opened the native camera. Actual app shutter/plugin/chunk handoff reached
  edit in a 19.493 s observed attempt. Runtime JPEG was **61287 bytes**, oriented
  **1392x1856**, Original/color/filter:none/fullframe/dirtyfalse; native safe tags
  recorded JPEG 1856x1392, EXIF 90. This is emulated-camera proof, not Pixel quality.
- Atomic native original-cache size/digest pairing is **NOT MEASURED/certified**:
  an early stat observed 61238 before the final EXIF write, while runtime/native
  final metadata were 61287. The misleading false paired-stat receipt is retained
  and corrected with null/NOT MEASURED. Gallery source identity is exact; no
  upgraded native-cache identity claim is made from the non-atomic observations.

The core checks are complete; no stress tests or repeated broad matrices were
added. Physical Pixel/OEM quality, cloud/stalled-provider behavior, broad device
lifecycle/rotation/permission acceptance and real advertising remain unverified.
No product code, native test timeout, SDK or production ad gate changed.

### Follow-up evidence

Local folder: `.superpowers/sdd/2026-10-02-native-camera-repairs/emulator/load-control-probe/`.
Important receipts: `quiet-gate-samples.json`, `health-result-corrected.json`,
`utc-harness-correction.json`, `anr-traces/`, `native-tests.txt`,
`gallery-selecting-dom.json`, `gallery-raw-fidelity.json`, `crop-draft-before-next.json`,
`saved-pdf-identity.json`, `pdf-image-dimensions-formula.json`,
`confirmed-picker-before-back.txt`, `confirmed-picker-cancel-dom.json`,
`app-capture-timing.json`, `app-capture-raw-fidelity.json`,
`capture-native-runtime-limit.json`, and safe numeric native tags.
Synthetic screenshots: `gallery-review.png`, `pdf-result.png`,
`app-capture-review.png`. Actual saved synthetic PDF: `actual-gallery-crop.pdf`.
These are local-only evidence, not repository binaries/public download links.

## Visible post-test usability session (separate from causal probe)

The user requested a visible window after testing. Only the owned headless VM,
read-only CDP forward and monitor were stopped. The probe data/evidence remains.
A fresh **ordinary writable**, no-snapshot QA AVD was created entirely outside
source watchers under task-owned TEMP, without copying original user data:

- AVD `CameraRepairQAVisible`, serial `emulator-5554`, API 34, QA user 0.
- TEMP: `C:\Users\Macbook Pro 2019\AppData\Local\Temp\ReamCameraQA-visible-20261002-06f1ec79`.
- Launcher PID 24812; qemu PID 12684; owned parent exec session 12684.
- Native title `Android Emulator - CameraRepairQAVisible:5554`, window 99813010.
- Same installed image/hardware/AEHD and configured RAM/core settings. Removing
  headless mode naturally made emulator auto select **host Vulkan/GLES**; primary
  explicitly approved keeping that renderer for usability. This is NOT combined
  with the software-renderer causal comparison or earlier app test receipts.
- All writable data/cache/encryption/SD/ram/pstore paths are QA-local. Exact debug
  APK installed with `-r`; Ream launched offline on the fresh QA context.
- The original default/website previews were restored with strict 5173/5174 and
  `VITE_REAM_INLINE_AD_PREVIEW=false`; both returned HTTP 200. VM runtime paths
  are now outside the Vite source tree; no Vite/product configuration changed.

Physical Escape interrupted supported Computer Use; no further UI action was
performed until the user explicitly resumed. Resume checks preserved the same
window/data and confirmed Ream MainActivity foreground, no draft/processing or
library items; no reset/relaunch/uninstall occurred. Read-only temporary CDP
inspection was removed. Windows Graphics Capture's FrameArrived timeout is a
capture-tool limitation, not proof of Android ANR; native window metadata and
exact-device Android state are distinguished from Windows screenshot contents.

The visible window and its owned parent remain running for user interaction.
User changes in this QA data are writable/persistent; no automatic cleanup was
performed. Bounded post-restore resource/responsiveness receipts are kept in the
TEMP folder, not mixed with causal-probe results. Shared processes, original
AVD user data/media/snapshots, source work and 16 output artifacts are preserved.

### Resumed final usability receipt

After explicit user resume, read-only checks revalidated the same visible AVD,
serial/window/PIDs/TEMP data and installed Ream package. No application state was
reset or relaunched. Presence-only inspection found no draft/pages/library items
or job/gallery wait at that timestamp; its temporary CDP forward was removed.
The fresh Android screenshot `resumed-ream-screen.png` verifies actual Ream Home
with empty Recents (earlier `visible-ream-home.png` had captured startup splash,
not Home). Later user camera/draft interactions are preserved without UI input.

A bounded 30-second check with restored previews recorded CPU 9.1–42.3%
(mean 20.5), available RAM 2415–2524 MiB, commit headroom approximately 4.82–5.00
GiB, modest paging, and three ADB roundtrips 361/334/342 ms. Ream MainActivity was
foreground with no current ANR. Both previews returned HTTP 200, owned exec
sessions 5173=1252/PID1840 and 5174=19726/PID38120. The bounded checks/own monitor
ended; no CDP forward remains. Visible emulator parent 12684 and window remain
running for the user. No host capture/input fallback was used.

Source 26 entries still match manifest ACD635... and debug APK B6DCCE... exactly.
Only narrow testing documentation/ledger was updated. A subsequent request to
remove the web camera-opening interstitial is a pending UX design, not included
in this APK or these test results. Android camera initialization is not claimed
instantaneous. Production ads, physical Pixel quality and cloud-provider gates
remain unverified/disabled as previously stated.
