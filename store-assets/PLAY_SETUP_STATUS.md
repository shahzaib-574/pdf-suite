# Play setup check — 10 September 2026

This is a dated Console observation, not a guarantee of future approval.

**Live update — 29 September 2026:** Play Console showed
Ream: PDF Tools & Scanner / `com.reampdf.mobile` with closed Alpha release
**1.2.0 (6) — Ads and privacy choices** fully rolled out since 16 September 2026.
Production remained inactive. The dashboard showed 12 testers opted in for 12
continuous days, so the production-access application remained unavailable pending
the 14-day condition. This is closed-test delivery, not a public production release
or approval.

The repository has no version 6 release manifest or Play-downloaded AAB hash to
prove that the uploaded bundle is byte-for-byte from exact pre-audit baseline
`2f6e330`. That historical gap remains explicit and is not rewritten.

The next candidate is **1.2.1 (7)**. Protected screenshot
[run 36566379362](https://github.com/shahzaib-574/pdf-suite/actions/runs/36566379362)
built a signed, nondebuggable Google-test-ad APK from exact source
`6b3ead375d7d039b7346452d2043f9d30dd9fcad`. Five useful API 36 captures were
visually reviewed and selected with schema 2 source, signer, APK and test-ad
provenance; the blank scan-editor frame was rejected and retained only as original
evidence. The former 1.1.1 (4) selection is archived rather than overwritten.
Final exact-head capture
[run 36583170884](https://github.com/shahzaib-574/pdf-suite/actions/runs/36583170884)
passed signing, artifact, ELF/ZIP, screenshot provenance, corrected visual
readiness, and the official API 35 16 KB smoke. The smoke exercised the signed
release PDF reader and native camera, then verified a visible home screen and the
same live process after five seconds. Signed production candidate
[run 36581089000](https://github.com/shahzaib-574/pdf-suite/actions/runs/36581089000)
also passed and recorded exact package/version, signer and AAB/APK/mapping hashes;
it did not upload anything to Play. No 1.2.1 bundle has been published. See the
[signed candidate record](RELEASE_1.2.1_CANDIDATE.md) and
[repository and upgrade audit](../docs/repository-audit-2026-09-29.md).

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

Historical internal delivery: **1.1.1 (4)** became Active / Available to internal testers at 3:31 AM Asia/Karachi on 10 September 2026. See [camera update record](PLAY_UPDATE_1.1.1.md). The later closed Alpha 1.2.0 (6) observation is recorded above; the 1.1.0 details below are retained as the initial release history.

The publisher confirmed the policy/export declarations after the compliance review. Ream: PDF Tools & Scanner, `com.reampdf.mobile`, English (US), App and Free was created. Version 3 (1.1.0) is now published to the active internal testing track and shown as available to internal testers. See [verified upload record](PLAY_UPLOAD_2026-09-10.md) for the release and tester links.

At the 1.1.0 upload checkpoint, the listing support email was info@reampdfsuite.com, the privacy URL was https://reampdfsuite.com/privacy.html, and native metadata was version code 3 / 1.1.0. That historical uploaded build was ad-free; the 1.2.0 candidate described above is a separate ad-supported update.

Signed release workflow [34401419040](https://github.com/shahzaib-574/pdf-suite/actions/runs/34401419040) passed after replacing the screenshot harness and fixing older-WebView PDF compatibility. AAB/APK hashes and all six captures were verified locally. Four reviewed screenshot images and strict provenance pass both store validators. See [compliance review](COMPLIANCE_REVIEW_2026-09-10.md) for prepared app-content declarations and the Data safety correction, and [encryption assessment](ENCRYPTION_ASSESSMENT.md). Ream is Registered for Android developer verification with three verified Play signing keys. Store setup, closed testing (12 testers for 14 continuous days), production access, physical-camera QA and Google's review remain outstanding.
