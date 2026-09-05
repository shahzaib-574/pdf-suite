# Free GitHub OTA updates

Ream uses the MIT-licensed Capacitor Live Update plugin with a public GitHub Releases repository: https://github.com/shahzaib-574/ream-pdf-updates. No Capawesome account, subscription, cloud app ID, or device token is required. Expo EAS still builds APKs.

The app checks at startup and when returning to the foreground (at most once per 15 minutes), downloads a signed bundle, and stages it for the next full app launch. It never reloads an active document task. Offline or failed update checks leave the current app working.

Both the update manifest and ZIP are signed with RSA/SHA-256. The native plugin verifies the ZIP against the public key embedded in the APK. Manifests must match the native version and channel, and downloads must come from this specific update repository. Previously accepted sequence numbers prevent replaying older manifests. A 15-second readiness timeout rolls back a bundle that cannot load, and failed bundles are blocked. Republishing a known-good web version with a new sequence supports intentional rollbacks.

## Initial setup (completed)

- `ota.config.json` selects the public release repository.
- `ota-public.pem` is the public verification key and belongs in source control.
- `.ota-private/signing.pem` is the private publishing key, excluded from both Git and EAS uploads. Back it up securely. Never upload it to the public repository.
- Android native versionCode 2 contains the updater. Older APKs need one manual installation of an OTA-enabled APK.
- EAS preview builds subscribe to `preview-2`; normal production builds use `production-2`.

## Push updates

### Update the APK currently installed on your phone

1. Make your changes and verify them in the local browser.
2. Open PowerShell in the project folder:

   ```powershell
   cd "C:\Users\Macbook Pro 2019\pdf-suite"
   ```

3. Publish to the preview APK:

   ```powershell
   npm run ota:push:preview
   ```

4. Wait for the terminal to report `Published`. If a check or upload fails, fix that error before retrying.
5. Open Ream on your phone with internet access and leave it open long enough to download the update. It checks on startup; repeat foreground checks are limited to once per 15 minutes.
6. Fully close Ream, then reopen it. A completed download is applied on this next launch. Merely switching apps may only resume the existing session.

The phone must have the OTA-enabled APK installed once. The current test APK uses the preview channel; publishing to production will not update it. You do not need to rebuild the APK for compatible web UI or processing changes.

### Requirements and production publishing

Keep `.ota-private/signing.pem` on your publishing computer. If GitHub authentication has expired, run `gh auth login`. On a new computer, install Node.js and GitHub CLI, run `npm ci`, and securely restore the existing signing key.

After verifying the preview update, publish to production APKs separately:

```powershell
npm run ota:push:production
```

Each command runs lint, quality checks and a production web build, creates a signed ZIP and manifest, uploads an immutable bundle release, then updates that channel's manifest. Publishing compiled web assets is public; source files and private keys are excluded. This is a manual push command, not an automatic deployment on every Git commit.

For a local package without publishing:

```powershell
npm run ota:push:preview -- --prepare-only
```

Increase Android versionCode and ship a new APK for native dependency, permission, configuration or signing-key changes. Do not ship JavaScript requiring new native APIs to an old channel. Keep the signing key; changing it requires a new APK. OTA updates must preserve stored-data compatibility.

## Verification

Browser bridge simulations cover valid download/staging, signature tampering, wrong native version, rollback blocklists, offline behavior and already-installed bundles. Package signatures and public release downloads are verified locally. These checks do not replace an Android device test: install the new APK, launch online to download, fully close and reopen to activate, then verify offline launch and rollback using a deliberately broken preview bundle.

GitHub receives normal HTTP request information (including IP address) and the versioned channel/download path. No app-generated installation ID or document contents are sent. The bundled privacy policy describes this. Review store declarations before a production release.
