# AdMob and UMP test matrix

Version 1.2.0 uses `@capacitor-community/admob` 8.1.0. Every app launch asks Google UMP for current consent information, shows a required form, and requests an ad only when `canRequestAds` is true. Both the UMP request and Mobile Ads initialization set `tagForUnderAgeOfConsent: true`; maximum content rating remains General and COPPA child-directed treatment is unset. Errors, denial, offline use, and no-fill must leave every document tool usable.

## Test builds only

`npm run android:debug` uses Google's anchored adaptive banner test unit `ca-app-pub-3940256099942544/9214589741`, `isTesting: true`, and optional UMP debug geography/device IDs from `.env.android-debug` or ignored `.env.android-debug.local`. Never click a live ad. Never use the production banner unit in a debug build.

```dotenv
VITE_ADMOB_TEST_MODE=true
VITE_UMP_DEBUG_GEOGRAPHY=EEA
VITE_UMP_TEST_DEVICE_IDS=
```

For hardware UMP testing, copy the hashed test-device identifier from Logcat into the ignored local file. Values may be comma-separated. Production builds ignore these variables, set `isTesting: false`, omit UMP debug options, and use the exact IDs in `monetization.config.json`.

## Account-side prerequisite

Publish applicable European regulations and US-state messages for Android package `com.reampdf.mobile` in AdMob Privacy & messaging. Configure a privacy-options entry point where required. Repository code cannot publish these forms, and this document does not claim they are live.

## Deterministic gates

```powershell
npm run ads-selfcheck
npm run android:sync:debug
npm run verify:ads -- --debug
cd android
.\gradlew.bat --no-daemon lintDebug testDebugUnitTest assembleDebug
```

Then return the tree to production-synced assets with `npm run android:sync` and `npm run verify:ads`.

## Required device cases

For EEA, US, and OTHER test geographies, clear app data before each first-launch case and record device/API/WebView/build:

- accept, reject, and manage-options flows offered by the published form;
- confirm Logcat/request inspection shows under-age-of-consent treatment for every request and no child-directed flag;
- relaunch with a stored decision and verify UMP is refreshed;
- Settings privacy action appears only when UMP reports REQUIRED;
- airplane mode, request error, denied consent, and no-fill do not block tools;
- no blank banner gap exists before both a real Load and nonzero SizeChanged event; reserved height matches the reported logical height;
- banners appear only on Tools and Recents, never Settings, reader, scan, any tool/result, incoming-file overlay, camera, save, share, or download controls;
- rapid navigation cannot let a stale callback restore a banner or spacing on a disallowed route;
- rotation, background/foreground, dark mode, large text, and TalkBack keep the banner clear of navigation and actions.

Official references: [Google UMP](https://developers.google.com/admob/android/privacy), [test ads](https://developers.google.com/admob/android/test-ads), and [Capacitor Community AdMob](https://github.com/capacitor-community/admob/tree/8.1.0).
