# Ream 1.2.0 ad-supported compliance review

Prepared 16 September 2026 for package `com.reampdf.mobile`, version 1.2.0 (6). This document supersedes ad-free guidance for the new candidate only; historical release records remain historical. It records local implementation and gates, not Play/AdMob approval.

## Locally implemented

- `@capacitor-community/admob` 8.1.0 with pinned Google Mobile Ads 25.4.0 and UMP 4.0.0.
- Production app/banner IDs come from `monetization.config.json`; release metadata is explicit and release validation fails closed on missing, sample, mismatched, or test configuration.
- Android-debug uses Google's anchored adaptive test banner, test mode, and optional UMP debug settings. Production uses `isTesting: false`, no debug geography/device IDs, maximum content rating G, and under-age-of-consent treatment in both UMP and Mobile Ads initialization. COPPA child-directed treatment remains unset because under-13 groups are excluded.
- UMP refreshes consent information once each process launch, displays a required form, and gates requests on `canRequestAds`. Advertising failures do not gate document tools.
- Adaptive banners are limited to native Tools/Home and Recents discovery routes. Incoming-file overlays suppress them. Settings, scanner/camera, reader, tools, results, and file/save/download controls are excluded.
- Banner layout starts at zero and is reserved only after Load and nonzero SizeChanged events report the native logical height. Route changes serialize native removal/show operations and clear layout synchronously.
- Document processing, OCR, filenames, passwords, and recent files remain local and are not sent to Google advertising services.

## Data-safety impact

The Google SDK can process network/online identifiers (including IP and advertising ID where available), app/device information, consent choices, diagnostics, and ad interactions. The automatic GitHub updater separately exposes ordinary request information to its host. The publisher must map current SDK/provider behavior to the exact Play data-type, purpose, retention, encryption, required/optional, and sharing questions for every distributed version. Do not submit a blanket no-data declaration.

## Audience and child-appropriate ads gate

The currently observed Play target-audience selection is 13-15, 16-17, and 18+. Play warns that some users in these groups are children depending on country and requires child-appropriate ads. Because there is no neutral age screen, the app conservatively applies under-age-of-consent treatment to every request and retains the General content ceiling. This does not prove that account-side message configuration or every served creative complies; those remain publisher acceptance gates. The app is not described as adult-only, and under-13 groups are not selected.

## External release gates

- Publish and validate applicable AdMob UMP messages and privacy-options configuration.
- Link/verify the Play listing and root `app-ads.txt` in AdMob.
- Publish the matching privacy policy; save/review Contains ads and Data safety answers.
- Produce and inspect the signed AAB; pass final manifest, permission, DEX, signature, alignment, and exact-head checks.
- Rerun the dedicated API 36 **Capture store screenshots with Google test ads** workflow after the final under-age metadata change, visually review its three native captures, and promote its schema-2 provenance. The local API 34 capture is truthful evidence but predates that final metadata field and is intentionally rejected by the final store verifier.
- Complete real-device consent, denial, offline/no-fill, placement, accessibility, camera, file-intent, save/share, and document-quality acceptance without clicking live ads.
- Obtain Play review/approval and meet testing/production-access requirements.

No account-side action, signing result, device result, upload, or approval is claimed by this document.
