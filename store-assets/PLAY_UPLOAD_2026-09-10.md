# Ream internal release — 10 September 2026

The publisher explicitly confirmed the policy/export declarations and authorized creation and internal-test upload after reviewing the compliance assessment.

## Verified Play Console result

- App: **Ream: PDF Tools & Scanner**, package `com.reampdf.mobile`.
- Play app ID: `4976255738492630945`.
- Internal track: `4701026759107514294`; release ID `1`.
- Release: **1.1.0 (3) — Initial internal test**.
- Console status: **Active**, **Available to internal testers**, **Not reviewed**.
- Console release time: 10 September 2026, 1:57 AM (Asia/Karachi).
- Version accepted: **3 (1.1.0)**, Android API **24+**, target SDK **36**.
- The AAB's ReTrace/R8 mapping file was recognized automatically.
- A dedicated Ream internal testing email list containing only the publisher's account was enabled. The existing portal tester list was not selected. No invitations or other messages were sent.
- Tester join URL: https://play.google.com/apps/internaltest/4701026759107514294
- [Release details](https://play.google.com/console/u/0/developers/5538107213509916329/app/4976255738492630945/tracks/4701026759107514294/releases/1/details).

Uploaded AAB SHA-256: `211dac5148a224e54f9889ad0722ec20065387b67ac800342e87065f4d37e73f`. This matches the downloaded, verified workflow 34401419040 artifact from source commit `1000f37d567dd3229604819144db799d83a20f08`. See [release manifest](RELEASE_1.1.0_MANIFEST.txt).

## Android developer verification

The registry now shows **Ream: PDF Tools & Scanner / com.reampdf.mobile / Registered** with three verified signing keys. These are Play's registered keys; this is not proof that the separate local upload-key-signed APK is registered for distribution outside Play.

## Remaining production work

This is an internal test, not a public production release or Google policy approval. Google currently displays the temporary listing name `com.reampdf.mobile (unreviewed)` until app setup and review are complete. Initial availability can take up to an hour or occasionally longer according to the publication dialog.

The dashboard requires completing app information/listing, publishing a closed test, and at least **12 testers opted in continuously for 14 days** before applying for production access. Internal testing does not satisfy that closed-test requirement. The prepared listing, Data safety and IARC facts remain in [the compliance review](COMPLIANCE_REVIEW_2026-09-10.md); they are not recorded as submitted here. Physical-camera acceptance remains outstanding.

One nonblocking release warning remains: native debug symbols were not uploaded. The Java/R8 mapping is present; native crash symbols for the bundled native libraries should be addressed for diagnosis in a later release. Do not invent or upload symbols that do not match those binaries.
