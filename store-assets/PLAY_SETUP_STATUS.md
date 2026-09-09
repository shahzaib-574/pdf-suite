# Play setup check — 10 September 2026

This is a dated Console observation, not a guarantee of future approval.

## Existing apps

The developer account's Policy status reports no account issues. Both Royal Pearl Customer Portal (`com.royalpearl.mobile`) and Royal Swiss Customer Portal (`com.royalswiss.mobile`) report:

- Production distribution.
- Android developer verification package status Registered, with one signing key each.
- Policy status: No issues found.
- App content / Need attention: all caught up.

This does not establish whether any additional keys used outside Google Play need registration. The account displays a Personal account type despite its HRL Housing Pvt Ltd. developer display name. The account website field still offers verification for hrlhousing.com; it has not been replaced with the Ream support website.

The August quality notification announces future requirements, rather than a current violation: memory / bitmap / DEX optimization thresholds from February 2027 and restored sign-in during device migration for apps with login from April 2027. Assess the customer portal apps against these requirements in their own repositories. Ream currently has no login; enabling R8 alone does not prove its memory or optimization thresholds. [Official Google announcement](https://android-developers.googleblog.com/2026/08/app-quality-memory-optimization-secure-onboarding.html).

## Ream

The publisher confirmed the policy/export declarations after the compliance review. Ream: PDF Tools & Scanner, `com.reampdf.mobile`, English (US), App and Free was created. Version 3 (1.1.0) is now published to the active internal testing track and shown as available to internal testers. See [verified upload record](PLAY_UPLOAD_2026-09-10.md) for the release and tester links.

The listing support email is info@reampdfsuite.com and the privacy URL is https://reampdfsuite.com/privacy.html. Current native release metadata is version code 3 / 1.1.0. The current build is ad-free; public AdMob identifiers and website verification files are only prerequisites for later advertising integration.

Signed release workflow [34401419040](https://github.com/shahzaib-574/pdf-suite/actions/runs/34401419040) passed after replacing the screenshot harness and fixing older-WebView PDF compatibility. AAB/APK hashes and all six captures were verified locally. Four reviewed screenshot images and strict provenance pass both store validators. See [compliance review](COMPLIANCE_REVIEW_2026-09-10.md) for prepared app-content declarations and the Data safety correction, and [encryption assessment](ENCRYPTION_ASSESSMENT.md). Ream is Registered for Android developer verification with three verified Play signing keys. Store setup, closed testing (12 testers for 14 continuous days), production access, physical-camera QA and Google's review remain outstanding.
