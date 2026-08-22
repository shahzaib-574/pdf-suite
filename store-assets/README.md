# Ream Google Play listing package

This directory contains the English (United States) listing copy and source-controlled graphics for `com.reampdf.mobile`.

Use [`PLAY_CONSOLE_DECLARATIONS.md`](PLAY_CONSOLE_DECLARATIONS.md) as the audited answer sheet and internal-test gate. It prepares responses but does not claim that any account-side Play Console form has been submitted.

## Ready to upload

| Play Console field | File | Requirement check |
| --- | --- | --- |
| App name | `listing/en-US/title.txt` | 30 characters or fewer |
| Short description | `listing/en-US/short-description.txt` | 80 characters or fewer |
| Full description | `listing/en-US/full-description.txt` | 4,000 characters or fewer |
| Release notes (1.0.0) | `listing/en-US/release-notes-1.0.0.txt` | 500 characters or fewer |
| App icon | `graphics/app-icon-512.png` | 512 x 512, 32-bit RGBA PNG, fully opaque, sRGB, 1 MB or smaller |
| Feature graphic | `graphics/feature-graphic-1024x500.png` | 1024 x 500, 24-bit RGB PNG, no alpha, sRGB |
| Graphic alt text | `listing/en-US/alt-text.md` | Written for meaning rather than visual decoration |

The graphics are derived from the canonical `assets/logo.svg`. Their editable vector sources are in `graphics/source/`.

## Render the graphics

On Windows, install Python 3 with Pillow and Chrome, then run from the repository root:

```powershell
python store-assets/scripts/render_assets.py
```

The renderer uses a fixed viewport and sRGB color profile, then validates pixel dimensions, channel format, opacity, and file-size limits. Set `CHROME_PATH` if Chrome is not installed in a standard location.

## Screenshot gate

Do not upload mockups, browser crops, or fabricated screens. Follow `screenshots/CAPTURE_PLAN.md` after the release candidate is installed on an Android emulator or physical phone. Upload at least four real 1080 x 1920 portrait captures for stronger Play discovery eligibility. Write final alt text from the captured pixels using `screenshots/ALT_TEXT_TEMPLATE.md`.

On Windows, the guarded ADB helper captures and validates the six planned
emulator states without overwriting existing images:

```powershell
pwsh -File store-assets/scripts/capture_android_screenshots.ps1
pwsh -File store-assets/scripts/capture_android_screenshots.ps1 -ValidateOnly
```

## Play Console checklist

- [ ] Confirm the public app name is exactly the same in Play Console and the release candidate.
- [ ] Upload the icon and feature graphic from this directory.
- [ ] Capture, review, and upload at least four real phone screenshots.
- [ ] Paste the en-US listing copy without adding rankings, prices, testimonials, or unverified claims.
- [ ] Enable the Pages workflow on `main`, then verify `https://shahzaib-574.github.io/pdf-suite/privacy.html` without signing in and add it as the privacy-policy URL.
- [ ] Link a developer website whose host root can serve `/app-ads.txt`; a file under the `/pdf-suite/` project path is not sufficient for AdMob verification.
- [ ] Select the Productivity category and only tags that accurately describe shipped behavior.
- [ ] Declare that the app contains ads if AdMob is enabled in the release build.
- [ ] Complete Data safety from the release build's actual SDK behavior.
- [ ] Complete content rating, target audience, app access, and ads declarations.
- [ ] Verify the developer contact and support website shown to users.
- [ ] Upload a signed Android App Bundle with a higher `versionCode` than every prior upload.
- [ ] Test the exact bundle through an internal track before production review.

## Source guidance

Requirements were checked against Google Play's official preview-asset guidance:

<https://support.google.com/googleplay/android-developer/answer/9866151>
