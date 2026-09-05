# Build Ream on Expo EAS

Ream uses Expo's EAS cloud build service with its existing Capacitor Android project. The web UI and offline PDF engine remain packaged in the APK. This setup does not run inside Expo Go and does not use EAS Update.

The linked account is `shahzaib574s-organization`, with project slug `ream-pdf` and EAS project ID `6db70f7c-00bb-4d72-b9a1-b6257edf5cba`.

From the repository root, sign in interactively (never put passwords or tokens in chat):

```powershell
npx eas-cli@latest login
$env:EAS_DANGEROUS_OVERRIDE_ANDROID_APPLICATION_ID = 'com.reampdf.mobile'
npx eas-cli@latest build --platform android --profile preview
Remove-Item Env:EAS_DANGEROUS_OVERRIDE_ANDROID_APPLICATION_ID
```

EAS's static Gradle parser cannot resolve the application ID through the release validation code in this project. The command supplies the verified native ID explicitly; it does not change the APK's identity or bypass native release validation. Keep it aligned with `android/app/build.gradle` if the package name changes.

The custom build installs locked dependencies, runs lint and the quality regression checks, builds and syncs production web assets, checks for advertising code, installs Java 21, and runs Android lint, unit tests, and `assembleDebug`. EAS uploads the resulting APK for download from the build page.

The `preview` profile produces a debug-signed APK for device testing. It runs without a development server. It is not a Play Store release; the existing release signing checks remain enforced. Fresh cloud builds may use different debug signing keys, requiring testers to uninstall an earlier APK before installing another build (which removes its local data).

The upload excludes local test outputs, environment files, signing credentials, and generated Android assets. Capacitor regenerates its assets and plugin projects on the builder. The custom build deliberately skips Expo prebuild, which would replace this app's native project.

The APK build completed successfully on September 5, 2026: [EAS build 7e71b983](https://expo.dev/accounts/shahzaib574s-organization/projects/ream-pdf/builds/7e71b983-e59f-4378-ab85-2c6efedf9f7a). Android lint, unit tests, and APK assembly passed. The downloaded APK's ZIP integrity and packaged ad-free production metadata, JavaScript, and plugin registration were checked locally. The build log ends with an optional Expo config warning because this Capacitor project has no Expo runtime; the custom native build and artifact upload both succeeded.

An earlier attempt failed because Windows converted the Gradle launcher to CRLF. `.gitattributes` now requires LF for that launcher and custom build YAML. Android device testing is still required before a production release.
