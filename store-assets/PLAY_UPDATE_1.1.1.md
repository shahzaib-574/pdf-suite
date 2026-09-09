# Ream 1.1.1 (4) — smoother document edges

Published to internal testing on 10 September 2026, 3:31 AM Asia/Karachi. Play Console showed **Active** and **Available to internal testers** for release **1.1.1 (4) — Smoother document edges**.

- Package: `com.reampdf.mobile`.
- Internal track: `4701026759107514294`, release `2`.
- [Release details](https://play.google.com/console/u/0/developers/5538107213509916329/app/4976255738492630945/tracks/4701026759107514294/releases/2/details).
- [Tester join/update link](https://play.google.com/apps/internaltest/4701026759107514294).
- Source: `a595961e233b2ff93bbccd51be2f5e1a0ef3d7ae`.
- Signed workflow: [34411429953](https://github.com/shahzaib-574/pdf-suite/actions/runs/34411429953), passed.
- Native tests/measurements: [34411425771](https://github.com/shahzaib-574/pdf-suite/actions/runs/34411425771), passed.

The native camera uses more frequent bounded analysis, bulk luminance copies, reused buffers, stronger paper-vs-shadow scoring, subpixel refinement, adaptive tracking and short corner-bracket transitions. Border width is reduced from 3 dp to 2.4 dp. Original still-photo quality settings and data practices are unchanged.

The AAB/installed-APK hashes and capture provenance were verified. See [RELEASE_1.1.1_MANIFEST.txt](RELEASE_1.1.1_MANIFEST.txt) and [validation evidence](../docs/live-edge-validation-1.1.1.md). Three selected 1080×1920 RGB listing screenshots pass both validators; the v1.1.0 set remains under `archive/screenshots-1.1.0/`.

Play accepted the R8 mapping, reported zero device-support losses, and estimated the update at 1.06 MB. The optional native debug-symbol warning remains. Tester access was retained. The user's separate closed-track draft and app-content settings were not changed by this camera update. This is not a public production rollout or proof of physical Pixel 8 performance.
