# Repository and upgrade audit — 29 September 2026

This is a point-in-time audit of repository identity, Google Play delivery evidence,
validation, and upgrade needs. It does not record a production rollout or Google
approval.

## Approved remediation sequence

The audit originally put the red screenshot gate before dependency maintenance.
Implementation deliberately updates the approved same-major runtime dependencies
and advances the candidate to 1.2.1 (7) first, then performs one genuine capture
from that exact candidate. Capturing version 6 first would not prove the historical
Play binary and would require a second capture after the runtime changed. Version 6
remains historical and its exact-source provenance gap is not rewritten.

## Canonical source and related repositories

- [`shahzaib-574/pdf-suite`](https://github.com/shahzaib-574/pdf-suite) is the
  canonical application source repository. Its remote `main` branch and the local
  checkout both resolved to the pre-audit baseline
  `2f6e3304c5a89f1d9f1de74ad2d49c3049add02f`.
- The Android identity is consistently `com.reampdf.mobile` in
  `capacitor.config.ts`, `app.json`, `android/app/build.gradle`, release checks,
  and store records. The repository contains one root package and one Android app;
  no nested Git repository, second package root, or second Android app was found.
- [`shahzaib-574/ream-pdf-updates`](https://github.com/shahzaib-574/ream-pdf-updates)
  is not a duplicate source repository. It stores signed OTA web-bundle releases
  referenced by `ota.config.json`. Do not archive it while an installed build may
  still use that update channel. Disable or migrate OTA first if it is ever retired.
- `pdf-suite-native-camera` was a clean linked worktree of this same Git
  repository, not a second application repository. Its branch tip was
  `7d30d1a9985ab2fba7302eb60490b699702d5a2a`. Main contains the same camera bridge
  and TypeScript integration plus later native camera and test work; no uncommitted
  or untracked source needed recovery. The extra local checkout was retired
  non-forcibly after creating and pushing annotated tag
  `archive/native-document-camera-2026-09-29`; the original local and remote branch
  remain intact. If a future recovery is needed, recreate a detached sibling
  worktree with:

  ```powershell
  git worktree add --detach ../pdf-suite-native-camera archive/native-document-camera-2026-09-29
  ```

At audit start, no useful unpushed source change was found. Two local T3 checkpoint
commits dated 24 September have the same tree object as the pre-audit baseline and
therefore contain no additional file content.

## Google Play and release provenance

A live Play Console check on 29 September 2026 showed:

- **Ream: PDF Tools & Scanner**, package `com.reampdf.mobile`.
- Closed **Alpha** release **1.2.0 (6) — Ads and privacy choices**, fully rolled
  out on 16 September 2026.
- 12 testers opted in for 12 continuous days. Production remained inactive and
  the production-access application remained unavailable until the 14-day test
  condition is met.

These facts establish that this repository has the same permanent package identity
as the Play app. They do not, by themselves, prove byte-for-byte source provenance
for the uploaded version 6 bundle. The repository retains commit and hash manifests
for versions 3 and 4, but no equivalent version 6 release manifest or Play-downloaded
bundle hash was found. The existing local version 6 APK passes
`verify-android-artifact` and Android build-tools `zipalign -P 16`; it is evidence
for a local candidate, not proof that the Play bundle was built from exact pre-audit
baseline `2f6e330`. Record the source commit, AAB/APK/mapping hashes, and signing
certificate digest for every future Play upload.

## Remediation status

GitHub Verify [run 35107922071](https://github.com/shahzaib-574/pdf-suite/actions/runs/35107922071)
failed at the audited code commit `2f6e330`. A fresh local
`npm run verify:store-assets` reproduced the same failure: the selected screenshot
provenance is from version 1.1.1 (4), while the release identity is version 1.2.0
(6). All later Android CI stages were skipped.

That guard was not loosened. Remediation advanced the post-upgrade candidate to
1.2.1 (7), then protected API 36 run
[36566379362](https://github.com/shahzaib-574/pdf-suite/actions/runs/36566379362)
captured a signed, nondebuggable Google-test-ad APK from exact source
`6b3ead375d7d039b7346452d2043f9d30dd9fcad`. Five useful frames were visually
reviewed and selected with schema 2 source, signer, APK and test-ad provenance.
The blank scan-editor frame was rejected rather than promoted. Original framebuffer
PNGs and the original manifest are preserved separately from the losslessly
normalized RGB store files, and the former 1.1.1 (4) selection is archived.

Final exact-head capture
[run 36583170884](https://github.com/shahzaib-574/pdf-suite/actions/runs/36583170884)
passed signing, artifact, ELF/ZIP and screenshot-provenance checks, corrected API
36 visual readiness, and the official API 35 16 KB smoke. The signed release test
exercised PDF rendering and the native camera, then confirmed a visible home screen
and the same live process after five seconds. Signed production candidate
[run 36581089000](https://github.com/shahzaib-574/pdf-suite/actions/runs/36581089000)
also passed without publishing: exact source
`aaeca68531169bd28a1676fccb6cf3df81f5d867`, package `com.reampdf.mobile`, version
1.2.1 (7), AAB SHA-256
`16b50c07155520cfc1a2bffd058bb4ef313c5c7b2bbbd3e0f897808e1f0517a4`, and APK
SHA-256 `928d1bb268252e7d55446dbd9b359c227f7a8971901cf29d7e626fc665dfe719`.
No Play or OTA publication occurred.

## Checks run during this audit

- At the documentation-only audit baseline, passed: `git diff --check`, lint
  (with four then-existing React warnings), PDF,
  PDF-to-Word, quality self-checks, the production web build, and all five product
  quality browser checks.
- At that baseline, the browser UI suite passed 12 of 13 tools twice, then timed out waiting for the
  old `Reader` heading on the viewer route. An isolated diagnostic confirmed the
  viewer actually opened the four-page fixture and rendered all four pages.
- Failed at that pre-remediation baseline: `verify:store-assets`, for the version 4
  versus version 6 provenance mismatch described above. The reviewed 1.2.1 (7)
  five-image selection now passes the local store verifier and schema 2 provenance
  checks.
- Not run during that initial documentation-only audit: a fresh Android build,
  signing, emulator/device checks, and Play upload.
  Java and ADB were not available on this shell's PATH, and the limited free-disk
  margin made a new heavy Android build inappropriate for a documentation audit.
- Post-remediation validation fixed the stale reader locator: the browser suite is
  now 13/13, all eight edge/engine checks and all five product-quality checks pass,
  lint has three known React effect warnings, and both production-only and full
  dependency audits report zero vulnerabilities. Exact-head hosted Verify
  [36583144638](https://github.com/shahzaib-574/pdf-suite/actions/runs/36583144638),
  the signed production candidate, and the final signed 16 KB smoke all passed.

## Upgrade priorities

1. **Completed: exact-head release evidence.** The genuine 1.2.1 (7) screenshot
   selection, schema 2 provenance, preserved originals, release manifest, and
   exact-head hosted Verify are complete. Retain the historical version 6
   provenance gap and keep source/hash/signer manifests for every future Play
   candidate.
2. **Keep the current Android baseline.** `compileSdkVersion` and
   `targetSdkVersion` are already 36. Google Play requires API 36 for new apps and
   updates from 31 August 2026. Capacitor 8 also documents Node 22+, Android Studio
   Otter or newer, and AGP 8.13; the repository matches these project-level values.
   Sources: [Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-gb),
   [Capacitor 8 migration guide](https://next.capacitorjs.com/docs/next/updating/8-0).
3. **Implemented and emulator-smoked: native 16 KB compatibility.** Google now says
   Play updates targeting API 35+ must support 16 KB page sizes from 1 February
   2027, and specifically calls for checking ELF segments when native code exists.
   Ream packages native libraries. Fail-closed ELF program-header checks,
   `zipalign -P 16`, and the signed PDF-reader/native-camera smoke on the official
   16 KB emulator image all pass. A physical 16 KB device remains a useful external
   acceptance check, not evidence produced by this repository run. Source:
   [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes).
4. **Completed: conservative same-major dependency batch.** Capacitor
   core/Android/CLI 8.5.2 remain aligned; Capacitor Share 8.0.2, Capawesome Live
   Update 8.4.4, PDF.js 6.3.289, Vite 8.3.1, React/React DOM 19.3.0 and their
   compatible tooling updates passed the full web, Android, ad-policy, artifact,
   browser and dependency gates. Major AGP and TypeScript changes remain separate.
5. **Treat major toolchain changes as separate work.** Do not combine AGP 9.4 or
   TypeScript 7 with the same-major batch. AGP 9.4 requires Gradle 9.6 and is outside
   Capacitor 8's documented AGP 8.13 baseline. TypeScript 7 uses a new native
   compiler, has no programmatic API until 7.1, and changes several defaults.
   Sources: [AGP 9.4 compatibility](https://developer.android.com/build/releases/agp-9-4-0-release-notes),
   [TypeScript 7 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

`npm audit --omit=dev` reported zero production vulnerabilities. The full audit
reported three moderate development-only findings in the Capacitor CLI chain
(`@capacitor/cli` → `xcode` → `uuid`; advisory
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)).
The suggested automatic resolution was a Capacitor CLI downgrade, so remediation
does not apply `npm audit fix` blindly. Capacitor CLI 8.5.2 still selects xcode
3.0.1, whose UUID use is `uuid.v4()` without the advisory's caller-provided buffer.
A dependency self-check proves xcode can parse/write a PBX project and generate its
24-character identifier with a narrowly scoped UUID 11.1.1 override. The resulting
full audit reports zero vulnerabilities; the override remains covered by that
compatibility test until xcode updates its own dependency.

React 19.3 is an optional feature release, not a Play compliance requirement; use
its [official release notes](https://react.dev/blog/2026/09/09/react-19-3) to review
behavior changes before adoption.
