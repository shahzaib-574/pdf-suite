# Native document camera (Android 1.1.0 / versionCode 3)

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

OpenCV runs outside the UI thread on the latest camera frame, at most about
eight times per second. It combines Canny edges and light/dark Otsu contours,
approximates convex quadrilaterals, checks page area, edge lengths and angles,
and requires gradient evidence along all four sides. Frame-clipped pages,
small shapes, circles and unclear boundaries are rejected.

The overlay uses CameraX's analysis-to-preview coordinate transform, smooths
small movements and turns green after consecutive stable detections. Missing
outlines expire. Capture is always manual: a green outline does not trigger
the shutter. Tap the preview to focus; use Light for a dark scene.

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

This requires a new APK; web OTA cannot install native camera libraries.
The new binary subscribes to `production-3` (or `preview-3` for EAS preview).
Existing versionCode 2 installations stay on their version 2 channels.

`tests/browser/native-camera-selfcheck.mjs` verifies all eight EXIF orientations,
PDF color placement, a crop wider than 3200 pixels, and native-result integration
with crop review and PDF preview. Run against a Vite development server with
`REAM_TEST_URL` set to its address (default port 5180).

The manually dispatched `native-camera.yml` workflow builds/lints Android,
runs synthetic page-detection and real shutter tests inside an Android emulator,
and uploads the test APK and reports. These are implementation checks, not
physical-device camera acceptance.

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
