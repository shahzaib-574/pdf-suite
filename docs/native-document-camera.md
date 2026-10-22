# Native document camera (Android 1.1.1 / versionCode 4)

The Android scanner now uses CameraX Preview, ImageAnalysis and ImageCapture.
The shutter captures a separate still photograph with maximize-quality mode,
JPEG quality 100, and the highest available resolution in the selected camera
configuration. This does not guarantee the proprietary Camera app's HDR, RAW,
ultra-high-megapixel modes, lens selection, or manufacturer image processing.

The original JPEG is read through the existing bounded, chunked FileImporter
bridge. It is not resized to 3200 pixels or re-encoded during import. JPEG EXIF
orientation is honored when embedding it into a PDF, including mirrored images.
The live detector only reads a low-resolution luminance plane; it never changes
the colors or pixels in the still photo.

## Live page detection

OpenCV runs outside the UI thread on the latest camera frame. Version 1.1.1
reduces the minimum analysis interval from 130 ms to 33 ms (a ceiling near
30 analyses/second, not a guaranteed phone frame rate). The interval adapts to
measured processing cost to leave CPU headroom. Bulk row copies respect the
camera's luminance strides, native matrices are reused, contour areas are
calculated once, and strongly supported pages avoid redundant threshold passes.

The detector combines contrast-adaptive Canny edges and light/dark Otsu contours,
checks convexity, area and evidence on all four sides, scores boundary contrast
to prefer paper over weaker shadows, and refines accepted corners at subpixel
precision. Clipped pages, small shapes, circles and unclear boundaries still
fall back to manual cropping.

The overlay uses CameraX's analysis-to-preview coordinate transform. Its filter
smooths small jitter and responds faster during movement. Cyclic corner matching
prevents twisted borders when a rotated page changes its first detected corner;
one far-away detection cannot move the outline to a different object. Readiness
uses a 220 ms stationary window. A missed observation clears readiness and a
lost outline expires after 160 ms. Old UI results are discarded, only the latest
result is presented on a display frame, and pause/resume resets tracking.

The border is 2.4 dp instead of 3 dp: 20% thinner. Short angled corner brackets
replace the round dots. Paths are reused and drawing only continues while a
short, at-most-32 ms transition is active; Android's Remove animations setting
is respected. Capture remains manual. Tap the preview to focus or use Light.

After capture the detector analyzes the actual still photo again, accounting
for its EXIF orientation. Its suggested corners appear in crop review. The
full photograph is retained until the user accepts the crop. When confidence
is insufficient the full image is presented for manual cropping.

Color/perspective editing retains pixel resolution instead of applying the
old 3200-pixel cap. Images exceeding 32 megapixels are rejected for editing
with a clear error to bound memory; an untouched original can still be put
into a PDF. The existing 128 MB scan input budget still applies. Gallery
imports and browser-camera fallback retain their existing size limits.

## Delivery and verification

This requires a new Android/Play update; web OTA cannot replace native camera
code. Version 4 subscribes to `production-4` (or `preview-4`). Existing version
2/3 installations stay on their own channels until the native app is updated.

`tests/browser/native-camera-selfcheck.mjs` verifies all eight EXIF orientations,
PDF color placement, a crop wider than 3200 pixels, and native-result integration
with crop review and PDF preview. Run against a Vite development server with
`REAM_TEST_URL` set to its address (default port 5180).

The manually dispatched `native-camera.yml` workflow builds/lints Android,
runs synthetic page-detection and real shutter tests inside an Android emulator,
and uploads the test APK and reports. These are implementation checks, not
physical-device camera acceptance.

The Android suite also checks padded/strided luminance, stationary jitter,
movement lag, transient false detections, lost-page expiry, cyclic corner order,
moderate contrast and shadows. `DocumentEdgesBenchmarkTest` compares the frozen
1.1.0 detector and pixel-copy loop with the new code on the same emulator; its
timing output must not be presented as a Pixel 8 benchmark. The native outline
render is saved as `edge-checks/outline-native.png` in the test artifact.

Before production rollout, test a real phone in portrait and landscape with
printed text, colored documents, shadows, shiny paper, a cluttered desk, and
partially visible pages. Confirm preview alignment, saved image colors/detail,
manual corner adjustment, tap-to-focus, torch, permission denial, background /
resume, retake, adding pages, and PDF export. Check an update signed with the
same certificate as the installed app; do not uninstall an existing app that
contains user documents merely to install a differently signed test APK.

Reference APIs: [CameraX ImageCapture](https://developer.android.com/media/camera/camerax/take-photo),
[CameraX transforms](https://developer.android.com/media/camera/camerax/transform-output),
and [OpenCV Android](https://opencv.org/opencv4android-usage-models/).

## October 2, 2026 local repair candidate

The scan gallery path now preserves the selected JPEG/PNG bytes, including EXIF,
instead of applying the generic image-tool 3200-pixel/JPEG normalization. The
native camera original remains byte-preserved. Decodable other scan formats are
converted at full resolution; generic non-scan image-tool behavior is unchanged.
Scan-gallery ingestion rejects images over 32 megapixels; the existing native
edit 32-megapixel guard remains. Scan additions enforce the 128 MB retained
input budget across additions and retakes, including retained originals. A
rejected addition/replacement leaves the existing pages unchanged.

Native gallery UI distinguishes selecting, importing, reading and normalizing.
Provider copying uses a dedicated, bounded worker rather than the shared bridge
handler. Back cancels the owned request, closes its provider stream/cancellation
signal where supported, and ignores late results. A canceled external picker or
uncooperative provider may keep native ownership until it actually returns; the
app does not start duplicate copies or apply a generic timeout. Existing cached
files already handed to JavaScript are not deleted by a later cancellation.
Capture cancellation/recreation is also session-owned; a capture interrupted by
rotation returns a retry error instead of publishing a stale photo.

This is locally validated repair/diagnostic code, not proof that the reported
Pixel 8 color-detail problem or provider-specific gallery hang is resolved.
CameraX resolution selection, camera SDK versions and raw-original processing
are unchanged. Debug-only `ReamCamera` logs record bound still dimensions, saved
JPEG dimensions/EXIF and tap-focus outcome. `ReamImport` records phase boundaries;
progress fields contain bounded byte/file counts, not photo content. Neither
logger emits document names, URI paths or photo bytes. No persistent diagnostics
screen or user-photo test artifacts were added.

### Pixel 8 verification (not run locally)

Use the debug APK only on an authorized test installation; do not uninstall an
existing app containing documents to work around a signing mismatch. Record the
Android version. With synthetic printed/color samples, compare native capture
Original/color review, crop and PDF to the untouched original and OEM camera.
Record actual JPEG dimensions/EXIF and focus outcome; do not equate JPEG quality
100 or the normal highest-resolution preference with OEM-camera quality.

When a device is connected, collect only the safe diagnostic tags:
`adb logcat -s ReamCamera ReamImport`. Test local and cloud-provider selection,
waiting in the external picker, download/copy progress, successful review, picker
cancel, Back during copying/reading, immediate retry, background/resume, rotation
during capture and late provider completion. Confirm that canceled work cannot
replace a newer session's pages and that subsequent bridge actions remain
responsive. Arbitrary providers are not universally interruptible; note the
last phase rather than treating an open external picker as a timeout failure.
Physical Pixel camera and cloud-provider behavior remain NOT RUN. Targeted
emulator instrumentation attempts/limitations are recorded in the validation report.

Local evidence and APK identity are recorded in
[native-camera-repair-validation.md](native-camera-repair-validation.md).
