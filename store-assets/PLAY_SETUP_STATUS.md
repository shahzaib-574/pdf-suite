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

The signed build workflow creates the AAB, release mapping and manifest, and captures genuine Android screenshots. Signed artifact checks passed in runs 34398086909, 34398822376 and 34399450172. The AndroidX screenshot harness first failed compilation and then crashed against optimized release methods. Commit 4ea25a7 replaces that harness with platform instrumentation without changing production runtime dependencies or shrinking rules; run 34400363099 validates this replacement. Screenshot validation is pending. Download and verify successful artifacts before uploading. Physical-camera quality and complete store review remain separate acceptance steps.
