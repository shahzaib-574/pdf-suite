# AdMob privacy-message test matrix

Use this checklist only with an Android debug build and Google's test ads. UMP
debug geography is intentionally ignored unless `VITE_ADMOB_TEST_MODE=true`, and
the production release gate rejects any baked debug geography or UMP test-device
identifier.

## Account-side prerequisites

Before a real end-to-end run, create and publish the applicable messages under
**AdMob → Privacy & messaging** for the Android app `com.reampdf.mobile`:

- a European regulations message for the EEA/UK/Switzerland flow;
- a US state regulations message if the app will be distributed in covered US
  states (select the states that truthfully match the release plan);
- a privacy-options entry point wherever the selected message requires one.

The repository cannot create or publish those account records. The test build can
only request messages already associated with the injected AdMob app ID.

## Emulator test builds

`.env.android-debug` defaults to `EEA`. Android emulators are treated as test
devices by UMP, so each geography can be exercised without a live ad unit:

1. Set `VITE_UMP_DEBUG_GEOGRAPHY` in `.env.android-debug.local` to one of `EEA`,
   `US`, or `OTHER`.
2. Run `npm run android:debug`, install the APK, and clear the app's storage before
   each first-launch case.
3. Launch Ream and record the consent/message state. Never tap an ad, even though
   the build uses Google's official test banner.

Example local override (the `*.local` file is ignored by Git):

```dotenv
VITE_UMP_DEBUG_GEOGRAPHY=US
VITE_UMP_TEST_DEVICE_IDS=
```

## Physical test devices

On a physical device, run once and copy the hashed UMP test-device identifier from
Android Studio Logcat. Put it only in the ignored local override; multiple IDs are
comma-separated:

```dotenv
VITE_UMP_DEBUG_GEOGRAPHY=EEA
VITE_UMP_TEST_DEVICE_IDS=0123456789ABCDEF0123456789ABCDEF
```

Do not commit a test-device identifier. Remove the local override before preparing
a production bundle.

## Required cases

For each applicable geography, verify:

- clean install / cleared storage;
- accept, reject, and manage-options paths offered by the published message;
- process termination and returning launch;
- airplane mode or consent-update failure (document tools must remain usable and
  the app must stay ad-free when it cannot establish permission to request ads);
- **Settings → Privacy and cookie settings** reopens Google's options form when
  UMP says an entry point is required;
- a changed choice removes the current banner before any new request;
- banners appear only on Tools and Recents and never cover navigation or actions.

For `OTHER`, verify that no inapplicable message is forced and that the current
cached UMP decision controls whether ads can be requested. Re-run the matrix after
changing AdMob messages, vendors, target audience, distribution countries, SDK
versions, or ad formats.

Official setup and testing guidance:

- <https://developers.google.com/admob/android/privacy>
- <https://support.google.com/admob/answer/10860309>
