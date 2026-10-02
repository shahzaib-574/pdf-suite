# Ad-supported Android internal testing

The 1.2.0 debug build uses Google's test banner ID only. It requires Node 22+, JDK 21, and Android SDK 36.

```powershell
npm install
npm run lint
npm run ads-selfcheck
npm run android:sync:debug
npm run verify:ads -- --debug
cd android
.\gradlew.bat --no-daemon lintDebug testDebugUnitTest assembleDebug
```

The manual **Build ad-supported internal test APK** workflow performs the same checks and uploads a sideload-only debug APK. It does not upload to Play. A debug-signed APK may not replace a release-signed install; preserve local files before uninstalling.

## Acceptance matrix

Test API 24, a current Android phone, a low-memory device, and a tablet where available. Record model, API/WebView, commit, test geography, and result.

- Run every UMP/placement case in [the ad test matrix](admob-privacy-testing.md).
- Verify all document operations, reader/password/search, scan/camera/gallery, results/Recents, incoming VIEW/SEND intents, local retention, save/share, and cancellation with ads available, denied, offline, and no-fill.
- Verify banners never overlap navigation and leave no blank gap before load or after leaving Tools.
- Verify large text, TalkBack, rotation, light/dark, reduced motion, restart, and background/foreground transitions.
- Do not click ads. Seeing a live production creative in debug is a release-blocking failure.

After debug validation, restore production-synced generated assets with `npm run android:sync` then `npm run verify:ads`.

For a Play internal-track AAB use [the signed AAB workflow](android-production-aab.md). Publisher actions, real AdMob messages, signing secrets, device results, and Play review remain external gates; this repository does not claim they are complete.
## Tools-slot local candidate

The app-owned protocol-1 native host replaces the old bottom/Recents placement. It is a synchronized overlay, not a DOM child. Production capability stays disabled until physical-device acceptance. Build a new native APK with the commands above; a web-only OTA cannot add this bridge. See [the local validation record](tools-inline-banner-local-validation.md) for measured slot/controller/geometry proof and the outstanding hardware gates. Browser placeholders and mock bridge fixtures are not native ad evidence.
