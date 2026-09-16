# Google monetization setup

Public production identifiers live in `monetization.config.json`: Android package `com.reampdf.mobile`, AdMob app ID `ca-app-pub-9959568404035601~6472905937`, banner unit `ca-app-pub-9959568404035601/6186593767`, and publisher `pub-9959568404035601`. They are public configuration, not credentials.

Version 1.2.0 integrates `@capacitor-community/admob` 8.1.0, Google Mobile Ads, and Google UMP. The manifest reads the app ID from `@string/admob_app_id`. Production builds use only the configured production banner, `isTesting: false`, no test devices/debug geography, maximum ad content rating G, and `tagForUnderAgeOfConsent: true` in both UMP and Mobile Ads initialization. COPPA child-directed treatment is deliberately unset because the selected audience excludes under-13 groups.

Ads are anchored adaptive banners on native Android Tools and Recents only. Settings, reader, scan/camera, all tool and result flows, incoming-file choices, and save/share/download controls are excluded. Layout space remains zero until native Load plus nonzero SizeChanged events report the real logical height.

## Release checks

```powershell
npm install
npm run build
npx cap sync android
npm run ads-selfcheck
npm run verify:ads
npm run verify:monetization
```

The release build and artifact verifier reject missing/mismatched/sample IDs, test settings, stale generated plugin files, missing Mobile Ads/UMP code, incorrect metadata, and permissions outside the exact SDK-derived allowlist.

## External gates

Before rollout, the publisher must:

1. Link the published Play listing and verify `app-ads.txt` from `https://reampdfsuite.com` in AdMob.
2. Publish and test required Privacy & messaging forms for intended countries.
3. Publish the matching privacy policy and truthfully update Contains ads and Data safety. No repository file proves a Console form was submitted.
4. Confirm the currently selected Play groups (13-15, 16-17, and 18+). Play warns that users in these groups can be children depending on country. Configure child-appropriate ad serving and matching privacy messages; the global under-age tag and General ceiling do not by themselves prove every creative or account setting complies.
5. Complete signed AAB, real-device, consent, accessibility, and no-fill/offline acceptance without interacting with live ads.

Website seller files and AdSense verification remain separate from Android ad serving. Website ad scripts require separate approval and consent implementation.

Official references: [Mobile Ads quick start](https://developers.google.com/admob/android/quick-start), [UMP](https://developers.google.com/admob/android/privacy), [test ads](https://developers.google.com/admob/android/test-ads), [ad targeting](https://developers.google.com/admob/android/targeting), and [app-ads.txt](https://support.google.com/admob/answer/9363762).
