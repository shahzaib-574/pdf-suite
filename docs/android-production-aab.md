# Signed ad-supported production AAB

The protected `production-aab.yml` workflow builds signed APK/AAB artifacts; it does not publish to Google Play or change AdMob/Play Console. Required GitHub `production` environment secrets are:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_STORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

After reviewed changes reach `main`, run **Build signed production AAB** and confirm the manual input. The workflow installs exact dependencies, builds and syncs production assets, runs `verify:ads`, validates production IDs/UMP/rating, builds release lint/tests/APK/AAB, verifies signing and 16 KB alignment, and checks the final manifest, permissions, DEX SDK components, plugin registry, and packaged metadata. It uploads artifacts only.

For local verification, configure JDK 21 and Android SDK 36. Use ignored `android/keystore.properties` for a signed candidate, or only in CI use `-PallowUnsignedRelease=true` for compilation. Run `npm run android:sync` and `npm run verify:ads` first. Version identity must be 1.2.0 (6).

Before Play rollout, confirm the saved Play audience of 13-15, 16-17, and 18+, configure child-appropriate ads for users Play may treat as children depending on country, publish/test required UMP messages, publish the matching privacy policy, and update Contains ads and Data safety. The app conservatively tags every request as under the age of consent and caps content at General, but account-side configuration and served-creative review remain external. Complete real-device placement, denial, offline/no-fill, document, camera, and accessibility acceptance. None of these external gates is completed by a green workflow.
