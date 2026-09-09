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

The prepared Create app form contains Ream: PDF Tools & Scanner, `com.reampdf.mobile`, English (US), App and Free. Package name availability was confirmed. Creation remains unsubmitted pending the publisher's response to the policy and export-law declarations. No Ream release has been uploaded or published in Play.

The listing support email is info@reampdfsuite.com and the privacy URL is https://reampdfsuite.com/privacy.html. Current native release metadata is version code 3 / 1.1.0. The current build is ad-free; public AdMob identifiers and website verification files are only prerequisites for later advertising integration.

Signed release workflow [34401419040](https://github.com/shahzaib-574/pdf-suite/actions/runs/34401419040) passed after replacing the screenshot harness and fixing older-WebView PDF compatibility. AAB/APK hashes and all six captures were verified locally. Four reviewed screenshot images and strict provenance now pass both store validators. See [current compliance review](COMPLIANCE_REVIEW_2026-09-10.md) for release hashes, prepared declarations, the Data safety correction for update-host request information, and [encryption assessment](ENCRYPTION_ASSESSMENT.md). Real-camera device QA and the publisher's creation certification remain separate from successful automated release checks. No app has yet been created or uploaded in Play.
