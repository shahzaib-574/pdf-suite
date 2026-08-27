# Signed Android production bundle

The `Build signed production AAB` workflow is manual, runs only from `main`, and
does not upload anything to Google Play. It builds a signed `.aab` and retains it
as a GitHub Actions artifact for 14 days. Because release minification is enabled,
it also retains R8's `mapping.txt` and a release-verification manifest (artifact
hashes, package/version, and signing-certificate digest) as separate repository
artifacts for 90 days. A signed APK is built only to inspect the final manifest,
signature, and 16 KB alignment; it is not published or retained.
Artifact downloads follow repository read permissions, so keep the repository
private and restrict read access to release maintainers if the mapping must remain
confidential.

## One-time GitHub setup

1. Open **Settings → Environments → New environment** and create an environment
   named exactly `production`.
2. Add required reviewers, prevent self-review where available, and restrict the
   environment's deployment branches to `main`.
3. Add the five secrets below under **Environment secrets**. Repository-level
   Actions secrets with the same names also work, but environment secrets plus
   required reviewers are preferred.

| Secret | Exact value |
| --- | --- |
| `ADMOB_ANDROID_BANNER_ID` | Ream's adaptive banner unit ID: `ca-app-pub-9959568404035601/` + its 10-digit unit ID |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64 of the Play upload keystore file, with no data-URI prefix |
| `ANDROID_UPLOAD_STORE_PASSWORD` | Upload keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | Upload key alias inside the keystore |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Upload key password |

The workflow injects Ream's public Android AdMob app ID,
`ca-app-pub-9959568404035601~6472905937`, directly. The banner ID must use the same
publisher. Google's test banner ID, obvious documentation placeholders, and any
other app identity are rejected by the workflow, Gradle release gate, and packaged
artifact verifier. The sample app ID remains in the tracked debug resource; the
workflow replaces it only in the ephemeral runner checkout.

To save a keystore's base64 value directly with GitHub CLI in PowerShell, without
printing it or placing it in clipboard history:

```powershell
$uploadKeystoreBytes = [IO.File]::ReadAllBytes('C:\secure\ream-upload.jks')
$uploadKeystoreBase64 = [Convert]::ToBase64String($uploadKeystoreBytes)
$uploadKeystoreBase64 | gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64 --env production
Remove-Variable uploadKeystoreBase64, uploadKeystoreBytes
```

On Linux, save it directly through GitHub CLI without placing the value in the
command line or shell history:

```bash
base64 -w 0 /secure/ream-upload.jks | gh secret set ANDROID_UPLOAD_KEYSTORE_BASE64 --env production
```

For each of the other four values, run the following commands one at a time and
enter the value at the hidden interactive prompt:

```bash
gh secret set ADMOB_ANDROID_BANNER_ID --env production
gh secret set ANDROID_UPLOAD_STORE_PASSWORD --env production
gh secret set ANDROID_UPLOAD_KEY_ALIAS --env production
gh secret set ANDROID_UPLOAD_KEY_PASSWORD --env production
```

Keep the original upload keystore and its credentials in a separate secure backup.
GitHub cannot recover secret values after they are saved.

## Build the AAB

1. Commit the intended `appVersionCode` and `appVersionName` in
   `android/variables.gradle` and merge the release commit to `main`.
2. Open **Actions → Build signed production AAB → Run workflow**.
3. Select `main`, enable the production confirmation, and enable the adult-only
   audience confirmation only if the publisher has truthfully selected **Ages 18
   and over** in Play Console. Then approve the protected
   `production` environment when prompted.
4. After the job succeeds, download `ream-production-aab-<run number>`,
   `ream-production-r8-mapping-<run number>`, and
   `ream-production-release-manifest-<run number>` from the workflow run's
   **Artifacts** section.
5. Archive the mapping and verification manifest with the matching AAB, `appVersionCode`, and
   `appVersionName`. A mapping belongs to exactly one obfuscated build; keeping the
   wrong mapping makes production crash traces impossible to deobfuscate. Treat it
   as internal release material and upload it to Play Console for that release when
   Play does not ingest it automatically.

The workflow validates all secret presence and AdMob ID formats without printing
their values. It decodes the upload keystore under the runner's temporary folder,
creates `.env.production.local` and `android/keystore.properties` only on that
ephemeral runner, builds `bundleRelease` without the unsigned CI bypass, verifies
that the resulting AAB is signed and the R8 mapping exists, uploads the AAB and
mapping as separate artifacts, and removes the temporary keystore and configuration
files even when the job fails. Before upload it also reruns web/PDF/DOCX checks,
Android unit and release lint, validates the final APK's identity/SDKs/permissions,
rejects sample or debug ad configuration, verifies APK/AAB signatures and 16 KB
alignment, and records SHA-256 values. The mapping and verification manifest
contain no signing passwords or key material.
