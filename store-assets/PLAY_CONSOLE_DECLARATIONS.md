# Google Play Console declarations for Ream

> **Preparation document only — nothing in this file confirms that a Play Console form, listing, test track, or release has been submitted.** Apply these answers to the exact signed release bundle, review the Console summary, and submit only after the release gates below pass.

Audited against the repository on **August 22, 2026** for Android application ID `com.reampdf.mobile`.

## Release behavior audited

- The Android app targets API 36 with minimum API 24.
- PDF, DOCX, image, OCR, generated-file, and recent-file contents are processed and retained locally. There is no Ream account or cloud document service.
- Save uses Android's Storage Access Framework. Share is a specific user-initiated transfer through Android's share sheet.
- Scan launches the system capture/file experience. The app does not declare camera, broad storage, or photo-library permission.
- The production design includes Google AdMob adaptive banners on Tools and Recents only. It does not implement interstitial, rewarded, native, or app-open ads.
- The release is pinned to Google Mobile Ads SDK `25.4.0` and User Messaging Platform `4.0.0` through `@capacitor-community/admob` `8.1.0`.
- The app requests updated consent information before initializing ads, shows a consent form when required, does not request ads unless `canRequestAds` is true, and exposes Google's privacy-options form from Settings when required.
- All tools currently ship unlocked. There is no Play Billing dependency, sign-in, subscription, or reviewer-only area.

Code evidence: [`package.json`](../package.json), [`android/variables.gradle`](../android/variables.gradle), [`AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml), [`src/ads/admob.ts`](../src/ads/admob.ts), [`src/store/files.ts`](../src/store/files.ts), and [`src/store/entitlements.ts`](../src/store/entitlements.ts).

Re-audit this document whenever an SDK, permission, network request, analytics/crash product, account system, billing feature, cloud feature, or target audience changes.

## 1. Data safety

Google defines collection as transmitting data off the device, including transmission by an SDK. It also provides exceptions for a specific user-initiated transfer that the user reasonably expects, such as sharing a chosen file. See Google's [Data safety form guidance](https://support.google.com/googleplay/android-developer/answer/10787469).

### Top-level answers

| Play Console question | Prepared answer | Reason |
| --- | --- | --- |
| Does the app collect or share any required user data types? | **Yes** | Google Mobile Ads SDK automatically collects and shares the four types below. |
| Is all collected user data encrypted in transit? | **Yes** | Google documents TLS for all data collected by Mobile Ads SDK 25.4.0; Android cleartext traffic is also disabled. |
| Can users request deletion of collected data? | **No, unless a real request workflow is implemented before submission** | Clear Recents deletes local files; it is not a developer-operated deletion request for data processed by Google advertising services. Do not claim a deletion badge without an end-to-end process. |
| Does the app allow users to create an account? | **No** | No account, authentication, profile, or cloud service exists. The account-deletion URL requirement is not applicable. |
| Has the app completed an independent security review? | **No** | No qualifying external assessment is documented in this repository. |

### Data types to declare

Google's disclosure for the exact pinned Mobile Ads SDK version says that it automatically **collects and shares** IP address, user product interactions, diagnostic information, and device/account identifiers for advertising, analytics, and fraud-prevention purposes. It also states that these transfers use TLS. See [Google Mobile Ads SDK 25.4.0 Play data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure).

| Play category → data type | Collected | Shared | Collection choice | Purposes to select | Mapping from SDK disclosure |
| --- | --- | --- | --- | --- | --- |
| Location → **Approximate location** | Yes | Yes | Required | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | IP address may estimate general location. No Android location permission is needed for this inference. |
| App activity → **App interactions** | Yes | Yes | Required | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | App launch, taps, video views, and other product interactions. |
| App info and performance → **Diagnostics** | Yes | Yes | Required | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | SDK/app launch time, hang rate, energy usage, and related diagnostics. |
| Device or other IDs → **Device or other identifiers** | Yes | Yes | Required | Advertising or marketing; Analytics; Fraud prevention, security, and compliance | Advertising ID, app set ID, and applicable device/account-related identifiers. |

Use **Required** conservatively: Ream does not provide a global ad/SDK data-collection off switch. Consent choices can change ad-serving mode and the advertising ID is resettable/deletable in Android, but some ad delivery, app-set ID, fraud, or diagnostic data can still be processed. Do not mark a whole data type optional based only on ad-personalization choice.

Do not mark these transfers as ephemeral. Google's SDK disclosure does not say that all four categories are used only in memory and discarded immediately after the request.

### Data that is not declared as off-device collection in this build

- Selected PDF, DOCX, and image contents; extracted text and OCR output; generated files; filenames; recent-file history; theme and motion preferences. These stay in app/device storage.
- Files the user explicitly sends with the Share action. This is a specific user-initiated transfer to a destination the user selects, which falls under Google's sharing exception. Re-evaluate if automatic upload, cloud sync, telemetry, or background sharing is added.
- Files saved through Android's system document picker. The destination is chosen by the user; Ream does not upload a copy to a developer server.

No Firebase Analytics, Crashlytics, Sentry, account SDK, cloud storage SDK, or payment SDK is present in the audited dependency set. Do not add one without updating the form.

## 2. Ads and advertising ID

### Ads declaration

Select **Yes, this app contains ads**. Google explicitly includes third-party SDK banner ads in this declaration. An ad that is unavailable due to no fill, network state, or consent does not make the release ad-free. See [Prepare your app for review — Ads](https://support.google.com/googleplay/android-developer/answer/9859455).

Release facts to retain:

- Format: adaptive banner.
- Placement: Tools and Recents discovery pages only.
- Provider: Google AdMob.
- Ad loading is consent-gated.
- SDK maximum ad content rating is currently `ParentalGuidance`.

### Advertising ID declaration

Select **Yes** when Play asks whether the app uses advertising ID. Mobile Ads SDK 25.4.0 automatically merges `com.google.android.gms.permission.AD_ID` and may collect the advertising ID. Select these purposes, matching Google's SDK disclosure:

- Advertising or marketing
- Analytics
- Fraud prevention, security, and compliance

Google explains the SDK manifest merge and the resettable/deletable advertising ID in [Advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248).

### Ad release gates

- Replace Google's sample AdMob app ID in `android/app/src/main/res/values/strings.xml` with Ream's exact production app ID, `ca-app-pub-9959568404035601~6472905937` (the protected workflow injects it automatically).
- Bake a valid production banner unit into the release build with `VITE_ADMOB_TEST_MODE=false`; the release Gradle task already rejects sample or mismatched IDs.
- Create and publish the required European regulations message in AdMob. If Ream is distributed in covered US states, also configure the applicable US state regulations message. The code-side UMP flow alone does not create an account-side message.
- Verify the Play developer website and publish the tracked `store-assets/app-ads.txt` unchanged at that website hostname's root. A file only at `/pdf-suite/app-ads.txt` is not sufficient. See [AdMob app-ads.txt setup](https://support.google.com/admob/answer/9363762).
- Never click live ads during internal testing. Use Google's test mode/test devices for development builds and execute [`docs/admob-privacy-testing.md`](../docs/admob-privacy-testing.md) for deterministic EEA, regulated-US, and other-region paths.

## 3. App access

Select **All functionality is available without special access**.

- No sign-in, password, QR code, membership, location gate, subscription, or paywall exists.
- The local `pdf.pro` flag defaults to unlocked and is not a purchase entitlement.
- Reviewers can use their own non-confidential PDF, DOCX, or image fixture through the system picker.
- The consent form is a privacy choice, not an access restriction; document tools remain usable if ads cannot load.

Do not enter invented credentials. Optional review note:

> Ream requires no account. Choose any tool and select a reviewer-owned PDF, DOCX, or image through Android's system picker. Document processing works without an ad response.

If any future functionality is restricted, provide reusable review access that works regardless of location. See Google's [sign-in details requirements](https://support.google.com/googleplay/android-developer/answer/15748846).

## 4. Target audience

**Publisher decision required before submission.** The repository does not establish
which age groups the publisher actually designed Ream for, so do not copy a prepared
age selection from this document.

The current store presence is a productivity/document utility and does not use
child-directed characters, activities, or language. Those facts support answering
**No** if the publisher confirms that the listing is not designed to appeal to
children; they do not, by themselves, prove that the app is intended only for adults.

The production workflow applies `tagForChildDirectedTreatment: false` and
`tagForUnderAgeOfConsent: false` only when the release operator explicitly confirms
an adult-only audience. Without that confirmation, the signed production job does
not run and the Gradle gate rejects the synchronized assets. Treat this as a release
safeguard, not as evidence for the publisher's audience decision:

- If the publisher confirms that Ream was designed exclusively for adults, select
  **Ages 18 and over only** and retain the non-child/non-under-age ad treatment after
  a final policy review.
- If the intended audience includes teenagers or children, select the truthful age
  groups and complete a fresh Families, consent, ad-request, content-rating, and store
  presence review before building. Update the SDK flags and ad controls accordingly;
  do not ship the current assumptions unchanged.

Do not select or exclude age groups merely to maximize availability. Google requires
the selected groups to reflect the audience the app was actually designed for; see
[Target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159).

## 5. Content rating

Complete the live IARC questionnaire; do not copy an assumed final rating into Play Console. Prepared factual answers for the audited build:

| Topic | Prepared answer |
| --- | --- |
| Product type | Application / productivity or utility, not a game |
| Violence, fear, sexuality, nudity, profanity, drugs, alcohol, tobacco, or gambling | No app-supplied content |
| Simulated gambling or real-money wagering | No |
| In-app purchases or paid digital goods | No |
| Public user-generated content | No — documents are local and are not published to or discoverable by other Ream users |
| In-app user communication or social interaction | No — Android's user-invoked share sheet is not an in-app community or messaging service |
| Sharing a user's physical location with others | No |
| Unrestricted embedded web browsing | No |
| Advertisements | Yes — Google AdMob banners |

The assigned ratings come from independent rating authorities based on the submitted questionnaire. See [Content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655).

After Play assigns the rating, confirm that AdMob blocking controls and the SDK maximum ad content rating are no more mature than the app's rating. The current code ceiling is `ParentalGuidance`; lower it to `General` before release if that is required to match the assigned rating. Ads must be suitable for the app's content rating.

## 6. Permissions declaration

The source manifest declares `android.permission.INTERNET`. The AdMob plugin adds
`android.permission.ACCESS_NETWORK_STATE`; Mobile Ads SDK 25.4.0 and its pinned
WorkManager dependency merge the remaining normal permissions below. CI enforces
this as an exact packaged-APK allowlist rather than an expectation:

- `android.permission.INTERNET`
- `android.permission.ACCESS_NETWORK_STATE`
- `com.google.android.gms.permission.AD_ID`
- `android.permission.ACCESS_ADSERVICES_AD_ID`
- `android.permission.ACCESS_ADSERVICES_ATTRIBUTION`
- `android.permission.ACCESS_ADSERVICES_TOPICS`
- `android.permission.FOREGROUND_SERVICE`
- `android.permission.WAKE_LOCK`
- `com.reampdf.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

The WorkManager manifest also declares `RECEIVE_BOOT_COMPLETED`, but Mobile Ads SDK
25.4.0 explicitly removes it during manifest merge; the artifact gate fails if it
reappears. AndroidX Core declares Ream's package-scoped dynamic-receiver permission
with `signature` protection so only an app signed by the same certificate can use
it; it is not a runtime prompt or access to user data.

The app does **not** intentionally request `CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, precise/approximate location, microphone, contacts, phone, SMS, call log, or notification permission. Scan delegates capture to the system experience; import/export uses pickers and app-scoped cache. Android recommends these permission-minimizing patterns in [Minimize your permission requests](https://developer.android.com/privacy-and-security/minimize-permission-requests).

Expected Play result: **no high-risk or sensitive Permissions Declaration Form**. The advertising-ID question is separate and should be answered Yes as described above. Play evaluates the uploaded bundle, so inspect the final merged manifest in Bundle Explorer. If Play requests a sensitive-permission declaration, do not rationalize an unexpected permission—identify and remove its source or document the newly shipped core use case. See [Declare permissions for your app](https://support.google.com/googleplay/android-developer/answer/9214102).

## 7. Privacy-policy consistency

Current policy source: [`public/privacy.html`](../public/privacy.html).

### Already consistent

- Clearly named as Ream's privacy policy and linked inside Settings.
- States that document contents, OCR, generated files, and recents remain local.
- States that there is no account or cloud document service.
- Definitively identifies AdMob banner placement and the same four collected/shared
  data classes and three purposes used in the Data safety table.
- Describes consent gating and the in-app route back to Google's privacy choices.
- Describes TLS, local retention/deletion, Google-held advertising data, and Google
  privacy controls without treating Clear Recents as an ad-data deletion request.
- Explains picker-based camera, file, and share behavior without broad storage access.
- Distinguishes on-device document processing and user-directed Save/Share from the
  advertising metadata transmitted to Google.

### Must be completed before production submission

- Publish the policy at an active public URL that returns the policy without login, geofencing, a PDF download, or an editable document. Verify the URL from a signed-out browser and from the Play reviewer countries you support.
- Confirm the Play publisher/developer identity, add that identity to the policy, and
  provide a private privacy contact controlled by the publisher. The current public
  issue tracker warns users not to disclose sensitive information but is not a private
  inquiry channel; do not invent an entity name or email in source control.

Google requires a clear privacy policy with developer/app identity, contact mechanism, collected/shared data and parties, security, retention/deletion, and an active public non-PDF URL. See the current [Google Play Developer Program Policy — User Data](https://support.google.com/googleplay/android-developer/answer/17190352).

## 8. Internal-test checklist

Internal testing supports up to 100 testers and is the recommended first Play-distributed QA step. Google notes that internal-only apps are exempt from displaying the Data safety section, but the declarations should still be prepared now because they are required before broader distribution. See [Set up an internal test](https://support.google.com/googleplay/android-developer/answer/9845334).

### Artifact gate

- [ ] CI passes lint, web build, PDF/DOCX self-checks, Android lint/unit tests, debug build, optimized release APK/AAB, and 16 KB alignment verification.
- [ ] `versionCode` is unused and higher than every uploaded artifact; `versionName` matches release notes.
- [ ] The bundle is signed with the upload key and contains `com.reampdf.mobile`.
- [ ] Production AdMob app/banner IDs are present, belong to the same publisher, and no Google sample/test ID is present.
- [ ] Bundle Explorer shows only the expected permissions listed above and no unexpected SDK.
- [ ] Mapping/native debug symbol files requested by Play are retained for diagnostics.
- [ ] Public privacy-policy and developer-website URLs load without sign-in; root `app-ads.txt` is reachable and contains the exact AdMob publisher line.

### Play setup gate

- [ ] Create the internal tester list (maximum 100 Google accounts), add a private feedback email/URL, and save the opt-in link.
- [ ] Upload the signed AAB to Internal testing, review all warnings, add accurate release notes, and roll out only to the tester list.
- [ ] Confirm the package name is final before the first upload; Play fixes it once an artifact is uploaded.
- [ ] Record the artifact SHA-256, version code, rollout time, and tester group for the release log.
- [ ] Do not state that Data safety, Ads, App access, Target audience, Content rating, or Privacy policy forms are submitted until their saved Console summaries have been reviewed.

### Install-from-Play QA

- [ ] Install using the tester opt-in/Play link, not by sideloading; test clean install, upgrade, relaunch, background/restore, and uninstall/reinstall.
- [ ] Cover minimum API 24 and target API 36, plus a current small phone and a tablet/large screen.
- [ ] Verify Scan, PDF/DOCX/image import, every enabled tool, PDF reader/search, PDF-to-Word layout/OCR, Save, Share, Recents, and Clear Recents with synthetic non-confidential fixtures.
- [ ] Confirm Android shows no camera, storage, photo-library, location, microphone, contacts, or phone runtime permission prompt.
- [ ] Verify document tools remain usable in airplane mode and when ads fail or consent does not permit a request.
- [ ] Run the full UMP matrix in [`docs/admob-privacy-testing.md`](../docs/admob-privacy-testing.md): EEA, regulated-US (when distributed there), and other-region first/returning launches; verify Settings reopens privacy options only when required.
- [ ] Confirm the banner appears only on Tools/Recents, never overlays navigation or actions, survives rotation/resizing, and leaves no blank spacer after a load failure.
- [ ] Do not click live ads. Use test-device/test-mode builds for ad interaction testing.
- [ ] Verify light, dark, system theme, reduced motion, Android back behavior, 48 dp targets, TalkBack labels/focus order, and font scaling.
- [ ] Review Play pre-launch reports for crashes, ANRs, accessibility, security, and compatibility; resolve or explicitly triage every issue.

### Promotion gate

- [ ] Reconcile this answer sheet against the exact bundle's SDK index and merged manifest.
- [ ] Publish the policy at its public URL and add the confirmed publisher identity and private privacy contact described above.
- [ ] Complete and review the saved Console summaries for Data safety, Ads, Advertising ID, App access, Target audience, and Content rating.
- [ ] Capture real release-candidate screenshots according to [`screenshots/CAPTURE_PLAN.md`](screenshots/CAPTURE_PLAN.md).
- [ ] Confirm ad content controls match the assigned content rating and target audience.
- [ ] Resolve internal-test blockers before creating a closed, open, or production release.

## Official references

- [Google Play Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Mobile Ads SDK 25.4.0 data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455)
- [Advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248)
- [Target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159)
- [Content rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655)
- [Sign-in details requirements](https://support.google.com/googleplay/android-developer/answer/15748846)
- [Permissions declarations](https://support.google.com/googleplay/android-developer/answer/9214102)
- [Google Play Developer Program Policy](https://support.google.com/googleplay/android-developer/answer/17190352)
- [Internal, closed, and open testing](https://support.google.com/googleplay/android-developer/answer/9845334)
- [AdMob app-ads.txt setup](https://support.google.com/admob/answer/9363762)
- [Android permission minimization](https://developer.android.com/privacy-and-security/minimize-permission-requests)
