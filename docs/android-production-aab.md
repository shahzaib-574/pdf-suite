# Signed ad-free AAB

The protected `production-aab.yml` workflow builds signed APK/AAB artifacts. It does not publish to Google Play. No AdMob secrets, audience confirmation input, ad IDs or consent configuration are required.

Required GitHub `production` environment secrets:

- ANDROID_UPLOAD_KEYSTORE_BASE64
- ANDROID_UPLOAD_STORE_PASSWORD
- ANDROID_UPLOAD_KEY_ALIAS
- ANDROID_UPLOAD_KEY_PASSWORD

Keep the existing upload key for an existing Play app. Do not replace it with the disposable CI key or a debug key. Environment protection and main-branch restrictions remain in place.

After changes are reviewed and pushed to main, run **Build signed production AAB**, confirm the bundle build, and download the AAB and its R8 mapping from workflow artifacts. The workflow verifies signatures, release manifest, ad-free assets and 16 KB alignment. Increment the version code above previous Play uploads before another upload.

For local builds, configure JDK 21 and Android SDK 36, supply ignored `android/keystore.properties` using its example, then run `npm run android:bundle`. Ad-free production metadata is mandatory; do not bypass signing to create a Play upload.

Start with the Play internal-testing track. Uploading the AAB, choosing testers, publishing the hosted privacy policy and changing Console declarations remain publisher actions; this workflow does none of those automatically. See [internal testing](internal-testing.md).
