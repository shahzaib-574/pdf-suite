# Google monetization setup

Public account identifiers are stored in `monetization.config.json`. They were
read from the signed-in AdMob/AdSense account on September 10, 2026 (Asia/Karachi).
Publisher IDs and ad-unit IDs are public configuration, not login credentials.

The Android AdMob app is **Ream - PDF Suite**, package `com.reampdf.mobile`.
Its app ID is `ca-app-pub-9959568404035601~6472905937`. The newly created
**Ream Android Banner** unit is `ca-app-pub-9959568404035601/6186593767`.
The website AdSense client is `ca-pub-9959568404035601`.

## Website prerequisites

The build publishes `/app-ads.txt` for AdMob and `/ads.txt` for AdSense at the
domain root, with the authorized Google seller line. The website HTML contains
the AdSense account verification meta tag. Robots are allowed to read the site.
Run `npm run verify:monetization -- --build` after building the website.

Set the Google Play listing's developer website to `https://reampdfsuite.com`
and privacy-policy URL to `https://reampdfsuite.com/privacy.html`. AdMob finds
app-ads.txt from the developer website in the store listing; a project-subfolder
GitHub Pages URL does not put the file at that host's root. Ream's store details
were not yet linked in AdMob at the time of inspection.

In AdMob, link the published Play listing, open app verification, and request a
check after the root file is publicly reachable. Google controls verification
and app-readiness approval; creating an ad unit does not approve the app.

In AdSense, reactivation was requested and `reampdfsuite.com` was added to site
onboarding. Verify site ownership using the account meta tag or ads.txt and
request review once the site is deployed. Website approval is separate from
AdMob account approval.

## Before displaying Android ads

The current APK remains ad-free. Seller files and account IDs do not install an
ad SDK. An ad-supported release needs Google Mobile Ads plus UMP integrated into
the Android/Capacitor app, native app-ID metadata, the banner placement and a
new native versionCode/APK. The present `verify:ad-free` and release artifact
guards intentionally reject ad SDKs, ad IDs and advertising permissions; update
those guards as part of an explicit ad-supported build implementation.

Request UMP consent information each launch, show a required form, and request
ads only when UMP reports `canRequestAds`. Expose privacy options when required.
Use Google test ad IDs on development/test devices. Keep ads clear of file,
camera, crop and download controls; do not gate document access behind ads.

Confirm the intended age audience, configure the matching AdMob Privacy &
messaging forms and applicable child/under-age treatment, update privacy copy,
and update Play's Contains ads and Data safety declarations to match the actual
SDK/data behavior. Validate consent denial, unavailable network and no-fill
without breaking PDF tools. Never click live ads during testing.

## Before displaying website ads

AdSense approval, privacy disclosures and the required consent-management setup
come before loading its ad script. In regions where Google requires a certified
CMP, configure a supported consent solution. Only then add the AdSense script
and clearly separated ad placements (or deliberately configured Auto ads).
Verification meta tags and seller text files make no ad requests.

`liveAdsEnabled` is currently false and no ad script or SDK is loaded. This is
prerequisite configuration, not a claim that either product is serving ads.

Official instructions:
- [AdMob app verification](https://support.google.com/admob/answer/14538460)
- [Developer website and app-ads.txt](https://support.google.com/admob/answer/9363762)
- [Android SDK integration](https://developers.google.com/admob/android/quick-start)
- [Android consent with UMP](https://developers.google.com/admob/android/privacy)
- [AdSense ads.txt](https://support.google.com/adsense/answer/12171612)
