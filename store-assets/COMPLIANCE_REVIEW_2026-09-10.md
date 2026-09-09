# Ream Play compliance review — 10 September 2026

Scope: current ad-free Android app `com.reampdf.mobile`, version 1.1.0 (3). The website and future ad-supported Android build need separate/updated declarations. This records what was checked and prepared; it is not a record of submitted Play forms or Google approval.

## Release and functionality

- Production bundle signing, release lint, unit tests, ad-free artifact and 16 KB alignment checks passed in final workflow 34401419040. Downloaded AAB/APK hashes match the signed-release manifest.
- The real signed Android capture discovered a PDF-reader failure on an older WebView: `toHex is not a function`. Commit `1000f37` uses PDF.js's supported legacy main and worker builds, retaining the same PDF.js version and features.
- Local TypeScript/production build and lint passed, with an existing React effect warning. PDF operation, PDF/Word fidelity, protected-PDF password, delayed incoming-file, storage/retention and quality checks passed. A regression exercise removes newer Uint8Array and Map APIs from the page and actual worker; PDF loading still passes.
- `npm audit --omit=dev` returned zero reported vulnerabilities. This is a dependency-database result, not proof of absence of all vulnerabilities.
- Current web output contained 98 files and no APK, AAB, DEX, JAR, native shared library or executable files. The updater verifies signatures, channel/native version, download origin and replay sequence. Native changes still require a store build; OTA must not bypass review or change declarations covertly. [Google update policy](https://support.google.com/googleplay/android-developer/answer/16559646).
- Physical-device camera quality, autofocus, lighting and field edge-detection acceptance cannot be established by emulator screenshots. Complete that device QA before production rollout.

## Privacy and data safety

Document parsing, OCR, conversion and storage paths were inspected. Fonts, OCR models and PDF decoder assets are packaged locally. There is no Ream login, billing integration, ad SDK, analytics SDK, broad-storage permission or advertising-ID permission. Camera is optional and the system picker is available. Backup and device transfer of private app data are disabled; cleartext app network traffic is disabled. Settings links the privacy policy and offers local deletion.

The privacy URL is https://reampdfsuite.com/privacy.html and support address is info@reampdfsuite.com. The live policy and mailbox were verified. Local deletion does not delete previously exported files or a host's request logs.

**Do not submit a blanket no-data-collected declaration for automatic GitHub updates.** The updater contacts GitHub without a user action; IP address and request/channel information reach that host. [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) describes automatic service-request logging. No evidence establishes that these logs are ephemeral or processed exclusively on the publisher's instructions. The draft therefore includes network identifiers as collected/shared, rather than assuming a service-provider exception. [Google Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Play item | Prepared answer and basis |
| --- | --- |
| Ads / Advertising ID | No / No for this uploaded ad-free build. AdMob public IDs do not activate ads. |
| Restricted app access | No restrictions; no account or credentials needed. |
| Collected/shared data | Yes: Device or other IDs, for the IP/network identifier sent to the update host. Collected and shared; not claimed ephemeral; required because there is no in-app opt-out; app functionality and fraud prevention/security/compliance. |
| Documents, photos, OCR text, passwords and local history | Not collected off-device by Ream. A user choosing Save/Share controls the external destination; assess the user-initiated-transfer exception. |
| Location | No location permission, location inference or location API is implemented in Ream. Do not claim an IP address alone proves location collection. Reassess if the update provider's integration is confirmed to derive location for this service. |
| Transport protection | Yes, automatic app requests use HTTPS. Do not claim every external app chosen for sharing has identical protection. |
| Account creation/deletion | No account creation. Local file deletion is available. Do not claim developer-controlled deletion of GitHub request logs. |
| Independent security certification | No; no MASA or equivalent certificate has been obtained. |

Review the exact Console wording and saved summary before submission. These are prepared answers; there is currently no Ream app record to receive them. Internal-only testing has a Data safety exemption, but production/closed/open distribution needs the completed form.

## Audience, content rating and listing

The user's broad audience request is interpreted as all suitable **teen and adult** groups: 13–15, 16–17, 18+. Ream's document workflows, wording and interface are general productivity features, not preschool/child-directed content. This is an intended-audience choice, not a claim that IARC has assigned a 13+ rating. Do not select younger groups merely because the content is nonviolent. If the publisher intends an under-13 audience, perform the additional Families review before changing that selection. [Audience rules](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en).

Prepared IARC facts: utility/other app; no supplied violent, sexual, gambling, drug or offensive content; no in-app purchases; no social feed, matchmaking, public content exchange or unrestricted browser. Local document viewing and the Android share sheet do not constitute a hosted social service. The final rating is assigned by the rating authorities after the actual questionnaire; do not invent a certificate or guarantee a particular rating. [Rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655?hl=en).

Listing: Ream: PDF Tools & Scanner; English (US); free app; Productivity category; website https://reampdfsuite.com. Title and descriptions exist under `listing/en-US`. Descriptions explain local processing, English OCR and conversion limitations, and do not promise perfect Word reconstruction. The app is named Ream and does not use iLovePDF's identity in the listing. Icon, feature graphic, four selected authentic screenshots, alt text and capture provenance pass local asset checks. Six screenshots were captured; images 01, 03, 04 and 06 are selected after visual review. Scan/organize captures have less clear framing and remain unselected in the CI artifact.

## Encryption and creation declarations

See [encryption assessment](ENCRYPTION_ASSESSMENT.md). The documented working classification is standard finished mass-market software under 5D992.c / 740.17(b)(1), with no ordinary-app filing requirement identified in the current rules. This is a reasoned self-classification assessment for publisher adoption, not a government determination.

The policy/export checkboxes remain unsubmitted. The publisher must confirm the stated distribution facts and certification after reviewing this result. Signing checks and an assessment cannot certify future behavior, unknown publisher facts, or guarantee Google's approval.

## Final evidence

Signed release [workflow 34401419040](https://github.com/shahzaib-574/pdf-suite/actions/runs/34401419040) **passed**, including actual release installation, incoming image/PDF handling, PDF reading, five-page organization, PDF-to-Word conversion and Recents persistence on API 36. Source: `1000f37d567dd3229604819144db799d83a20f08`.

- AAB SHA-256: `211dac5148a224e54f9889ad0722ec20065387b67ac800342e87065f4d37e73f`.
- APK SHA-256: `de6088d405136d13aeaf32b96d99332e4e27c74620e51de6aa34919071ff0b9d`.
- Signing certificate SHA-256: `47af4be263f6bfb63065ba344d1c14096320308c75c55cc40acaee430c82063a`.
- All six downloaded capture hashes match the CI manifest and the installed APK hash matches the downloaded APK. Four selected PNGs were copied byte-for-byte into `screenshots/`; only provenance key normalization/selection was performed locally, without editing image pixels.
- `npm run verify:store-assets` passes, including title/description limits, icon/feature graphics, four 1080x1920 RGB screenshots, final alt text and SHA-256 provenance. The Windows screenshot validator also passes with `-ValidateOnly -State @(1,3,4,6)`; its JSON parser now preserves timestamp strings on PowerShell 7.5.
- The complete release manifest is [RELEASE_1.1.0_MANIFEST.txt](RELEASE_1.1.0_MANIFEST.txt). Downloaded AAB, APK and private R8 mapping are under `tmp/play-release-5/` and are not committed.

**Ready for publisher review and internal-test upload.** No Play upload, IARC rating, device-camera acceptance or production approval is claimed. No Android/ADB/MTP phone was found connected during this review; real-camera QA remains necessary before production rollout.
