# Play setup check — 10 September 2026

This is a dated Console observation, not a guarantee of future approval.

**1.2.0 candidate note (16 September 2026):** the repository now prepares an ad-supported candidate. Play Console has saved the Contains ads, Advertising ID, Data safety, and target-audience declarations; the selected audience is 13-15, 16-17, and 18+. Play warns that some users in these groups are children depending on country. The app therefore uses under-age-of-consent treatment for every request, a General ad-content ceiling, and no COPPA child-directed flag. The European privacy message is published in AdMob. The US-state message and final Play review remain external gates, and none of these saved declarations constitutes approval.

## Existing apps

The developer account's Policy status reports no account issues. Both Royal Pearl Customer Portal (`com.royalpearl.mobile`) and Royal Swiss Customer Portal (`com.royalswiss.mobile`) report:

- Production distribution.
- Android developer verification package status Registered, with one signing key each.
- Policy status: No issues found.
- App content / Need attention: all caught up.

This does not establish whether any additional keys used outside Google Play need registration. The account displays a Personal account type despite its HRL Housing Pvt Ltd. developer display name. The account website field still offers verification for hrlhousing.com; it has not been replaced with the Ream support website.

The August quality notification announces future requirements, rather than a current violation: memory / bitmap / DEX optimization thresholds from February 2027 and restored sign-in during device migration for apps with login from April 2027. Assess the customer portal apps against these requirements in their own repositories. Ream currently has no login; enabling R8 alone does not prove its memory or optimization thresholds. [Official Google announcement](https://android-developers.googleblog.com/2026/08/app-quality-memory-optimization-secure-onboarding.html).

## Ream

Latest delivery: **1.1.1 (4)** is now Active / Available to internal testers, published at 3:31 AM Asia/Karachi on 10 September 2026. See [camera update record](PLAY_UPDATE_1.1.1.md). The 1.1.0 details below are retained as the initial release history.

The publisher confirmed the policy/export declarations after the compliance review. Ream: PDF Tools & Scanner, `com.reampdf.mobile`, English (US), App and Free was created. Version 3 (1.1.0) is now published to the active internal testing track and shown as available to internal testers. See [verified upload record](PLAY_UPLOAD_2026-09-10.md) for the release and tester links.

At the 1.1.0 upload checkpoint, the listing support email was info@reampdfsuite.com, the privacy URL was https://reampdfsuite.com/privacy.html, and native metadata was version code 3 / 1.1.0. That historical uploaded build was ad-free; the 1.2.0 candidate described above is a separate ad-supported update.

Signed release workflow [34401419040](https://github.com/shahzaib-574/pdf-suite/actions/runs/34401419040) passed after replacing the screenshot harness and fixing older-WebView PDF compatibility. AAB/APK hashes and all six captures were verified locally. Four reviewed screenshot images and strict provenance pass both store validators. See [compliance review](COMPLIANCE_REVIEW_2026-09-10.md) for prepared app-content declarations and the Data safety correction, and [encryption assessment](ENCRYPTION_ASSESSMENT.md). Ream is Registered for Android developer verification with three verified Play signing keys. Store setup, closed testing (12 testers for 14 continuous days), production access, physical-camera QA and Google's review remain outstanding.
