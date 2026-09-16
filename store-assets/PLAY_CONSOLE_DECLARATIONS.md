# Play Console declarations — Ream 1.2.0 ad-supported draft

Updated 16 September 2026. This is a reviewable local answer sheet, not a record that Play Console, AdMob, UMP, or Data safety forms were submitted or approved. Recheck the exact uploaded AAB and every active track before saving account-wide answers.

| Item | Prepared answer and evidence |
| --- | --- |
| Contains ads | **Yes.** Version 1.2.0 contains Google Mobile Ads and shows anchored adaptive banners on Tools and Recents. |
| Advertising ID | **Yes / SDK use.** The merged Google SDK manifest is expected to add `com.google.android.gms.permission.AD_ID` and Android Privacy Sandbox AdServices permissions. The release artifact verifier enforces the exact allowlist. |
| Data collected/shared | Declare the Google Mobile Ads/UMP and update-host practices that apply to distributed versions: IP/network identifiers; advertising/device or other IDs where available; app/device information; consent choices; diagnostics; and ad interactions. Confirm Google's current purposes, retention, encryption, required/optional status, and service-provider treatment in the Console rather than copying assumptions. |
| Documents and local files | PDF/Word/image contents, filenames, extracted text, passwords, and recent history remain on-device and are not passed to the advertising SDK or Ream processing servers. User-directed Save/Share destinations are separate. |
| App access | No Ream account or login. Tools remain usable when offline, ads are denied/unavailable, or ad loading fails. |
| Camera/storage | Optional camera for scanning; system picker and gallery alternative; no broad storage permission. |
| Target audience | Current observed selection: 13-15, 16-17, and 18+. Play warns that some users in these groups are children depending on country and requires child-appropriate ads. There is no neutral age screen, so the implementation applies under-age-of-consent treatment to every request, retains the General content ceiling, and leaves COPPA child-directed treatment unset because under-13 groups are excluded. Account-side child-appropriate ad and UMP configuration remains an external gate. |
| Content rating | Answer the actual IARC questionnaire; no rating or approval is claimed here. |
| Account deletion | No account creation. Local files can be deleted individually or cleared in Settings. |
| Privacy policy | Publish and verify `https://reampdfsuite.com/privacy.html`, matching the uploaded build. |

Banners must never appear in Settings, reader/viewer, scan/camera, any tool or result flow, incoming-file choice, or save/share/download controls. UMP is refreshed each launch; ads are requested only when `canRequestAds` is true; the Settings privacy entry appears only when required.

Before rollout: publish/test applicable AdMob Privacy & messaging forms; verify child-appropriate ad configuration for the selected audience and countries; verify app-ads.txt/listing linkage; complete signed artifact and real-device testing; update Contains ads and Data safety; review all active tracks; and inspect Play's final saved summaries. Repository checks do not perform those actions.

Official guidance: [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [Contains ads](https://support.google.com/googleplay/android-developer/answer/9857753), [Target audience and Families](https://support.google.com/googleplay/android-developer/answer/9867159), and [Google UMP](https://developers.google.com/admob/android/privacy).
