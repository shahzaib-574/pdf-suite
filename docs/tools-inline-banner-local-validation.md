# Android Tools banner — local candidate validation

Initial local acceptance: 2026-09-30; validation refreshed for scoped Git delivery: 2026-10-02. **Native production capability remains disabled.** The initial local scope performed no Git delivery; the user separately authorized feature-branch commit/push on 2026-10-02. No Android installation, real ad load/click, release signing, SDK upgrade, OTA or store deployment is authorized or claimed. This is a synchronized native overlay, not a DOM-inline/shared native scrolling hierarchy.

## Exact candidate

- Workspace: `C:\Users\Macbook Pro 2019\pdf-suite`; branch `codex/tools-inline-banner`.
- Baseline HEAD: `dba700884437d7026cfb048ffe41b559ab4bf034`. This is the source baseline, not a delivery commit. The feature-branch Git commit records the delivered source; local APK/log/screenshot outputs are deliberately excluded.
- Original 2026-09-30 owned source/test/doc SHA-256 manifest (all33 matched at the initial2026-10-02 audit; subsequently one test script received the approved EOF-only trim): `C:\Users\Macbook Pro 2019\pdf-suite\.superpowers\sdd\2026-09-30-tools-inline-banner\candidate-source-sha256.txt`; tracked patch: same directory `tracked-candidate.patch`. This historical manifest excludes this self-report and generated outputs. Historical manifest SHA-256: A092086F6318D10B83AB8CF473474E9F27AA27562889C793F4D0E87A50778431. The current35-file source/design/plan manifest is `C:\Users\Macbook Pro 2019\pdf-suite\.superpowers\sdd\2026-09-30-tools-inline-banner\delivery-2026-10-02-source-sha256.txt`, SHA-256 `3E6860531653852F653B72D35097D6AA9DAE31756CB6F8F6A72AF6154FA89725`; it excludes this self-report and generated outputs.
- Current local debug APK (rebuilt2026-10-02): `C:\Users\Macbook Pro 2019\pdf-suite\android\app\build\outputs\apk\debug\app-debug.apk`; 174175654 bytes, SHA-256 808F656FF3C5DC1DE6115642C5573F690FC0F539F1412017FA327267466B8FD9. The accepted September30 APK was `18ACA356DE8B2A5E230E3C856AD0E1A0D9CBB15929C18C11991F5E51D17955BC`; it is historical, not the current rebuild.
- Identity: `com.reampdf.mobile`, versionCode7/versionName1.2.1. Schema4 `android-debug` metadata uses existing Google test banner, UMP, General rating, under-age-of-consent true, EEA geography. Native `TOOLS_INLINE_BANNER_PRODUCTION_VERIFIED=false`.
- Pins unchanged: AdMob8.1.0, GMA25.4.0, UMP4.0.0. No IDs/package/versioning/signing/OTA authority changes. Generated debug assets came from supported sync; generated Gradle was not manually edited.

## Initial local verification (2026-09-30)

Logs below are retained in `C:\Users\Macbook Pro 2019\pdf-suite\.superpowers\sdd\2026-09-30-tools-inline-banner\`.

| Gate | Observed evidence |
| --- | --- |
| Native authority/full geometry/session/gesture TDD | Task1 RED/GREEN logs and `task2-green.log`; active native bundle root and installed mode/ID/audience revalidated; no JS ID/consent/production-enable authority. |
| Side insets / suppression review fixes | `review-native-red.log` expected missing APIs/constructor, then `review-native-green.log` JVM/AndroidTest compile success. Both horizontal system/cutout bounds intersect in parent coordinates. Ordinary suppression hides SDK child/rejects new DOWN but preserves only already handed-off drag through UP; destructive invalidation CANCELs once. |
| Moving-host coordinate review fix | `review-coordinate-red.log` expected missing coordinate API; final native gate below. Slop uses raw physical screen coordinates. Cached DOWN and current MOVE/UP map from original physical positions to current WebView origin, never a later host origin. Added translated-host instrumentation traces compile only. |
| Final JVM / instrumentation compile / APK | `final-native-build.log`: `:app:testDebugUnitTest :app:compileDebugAndroidTestJavaWithJavac :app:assembleDebug`, BUILD SUCCESSFUL44s. **40 tests, zero failures**. Instrumentation **NOT RUN**. |
| Pure typed controller | `final-controller.log`, `npx --no-install tsx scripts/inline-banner-selfcheck.ts`, exit0: native-issued generations,100scroll updates/1prepare, ack distinct from actual visibility, retired/same-generation stale guards,60s no-fill boundary, width dedup, cleanup rejection and listener removal. RED regressions in `task3-red-cleanup.log`/`task3-red-stale-visible.log`. |
| Real React view + actual Home | `task4-green.log`, `node tests/browser/tools-inline-banner-selfcheck.mjs`, exit0: actual rectangles,80CSS measured creative plus label/separation, ack-before-visible, offscreen retention, ancestor position shift, width reprepare once, failure/eligibility collapse, stale/reverse slow ack, strict cleanup. Actual Home empty/3synthetic recents → slot → All tools; search/Recents/default-browser suppression; normal nav. `task4-red-collapsed-gap.log` caught56vs28 extra flex gap, fixed using existing Home gap token. |
| Policy/dependencies/lint/TS | `final-ads-selfcheck.log`, `final-dependency.log`, `final-lint.log`, `final-tsc.log`; `npm run ads-selfcheck`, `npm run dependency-selfcheck`, `npm run lint`, `npx --no-install tsc -b`, exit0. |
| Production / website builds | `final-production-build.log`, `final-website-build.log`; `npm run build`, `npm run build:website`, exit0. No production native release/signing/ad request. |
| Debug sync / ads verifier | `final-debug-sync.log`, `final-verify-ads.log`; `npm run android:sync:debug`, `npm run verify:ads -- --debug`, exit0. Mode/ID/UMP/audience/manifest guards retained plus custom host/production-off/absent preview checks. |
| Packaged real slot / native host / no test UI | `final-proof-artifact.log`, `node scripts/tools-banner-proof-artifact-selfcheck.mjs`, exit0. Real slot/native host packaged; production false; obsolete probe, development placeholder and fixture absent. `task5-red-artifact.log` first caught stale Task1-only APK. |
| Existing identity / permissions | `final-artifact-identity.log`, existing verifier `--print-artifact-identity APK_PATH`; `final-apk-permissions.log`, existing SDK aapt2 dump. Release verifier intentionally not claimed for debuggable APK. Source manifest unchanged; permission inventory compared to Task1 proof only. No pre-feature APK baseline preserved. |
| Tool/browser regressions | `final-quality.log`, `final-pdf-selfcheck.log`, `final-docx-selfcheck.log`, `final-browser-regression.log`; quality/pdf/docx/browser-selfcheck commands exit0. Browser13UI, edge gate and8engine checks passed. |
| Graph / whitespace | `final-native-dependencies.log`, `:app:dependencies --configuration debugRuntimeClasspath`; `final-diff-check.log`, `git diff --check`, exit0. |

Warnings retained: three existing Viewer effect warnings; Vite chunk-size/ineffective-import notices; PDF standard-font warnings; Gradle flatDir/experimental shrinking/Gradle9 deprecations. The pinned GMA global under-age getter/constant are deprecated (`sdk-deprecation.log`): conservative audience remains unchanged, not silently migrated to child/teen classification. Existing browser regression logged a development HMR/WebSocket send error despite all assertions/commands exiting0; no warning-free developer-transport claim.

## Layout screenshots — NOT REAL AD / not native-serving proof

`C:\Users\Macbook Pro 2019\pdf-suite\output\tools-banner-local\home-compact-DEVELOPMENT-PLACEHOLDER-NOT-REAL-AD.png` (390×844) shows3 synthetic recents, explicit **Development ad placeholder — not a real ad**, All tools and normal nav. Empty/seeded full-page shots are in the same folder. Default browser/website render nothing. Fixture uses the same React view and real controller via typed composition; product wrapper accepts no factory/bridge/global/query bypass. Runner retains a dynamically imported module namespace handle rather than repeatedly importing during Vite reloads.

## Outstanding physical / release gates — NOT RUN

- No Android hardware/emulator installation or connected instrumentation execution. Local compilation/JVM/JS/React/browser checks do not prove SDK loading, UMP/account state, cross-renderer compositing, native touch handoff/SDK tap safety, fling/reverse-fling, cutouts/landscape/fonts/density/API36/older Android, keyboard, zoom/nested scroll, accessibility or lifecycle.
- 50ms suppression and1s geometry timeout are conservative rules, not safety certificates. Unsupported mapping stays hidden/collapsed; no anchored fallback.
- Publisher/account/consent acceptance and production enable/signing/versioning/store/OTA need separate authorization. New native APK/AAB is required for protocol1; old/missing bridge collapses safely.
- Original previews5173/5174 recovered independently by primary and preserved; temporary5175/5176 are test-owned and stopped after review/testing. Original icons/unrelated generated icon output preserved.

The September30 local acceptance is recorded below; October2 Git delivery requires its own fresh primary staged-diff gate. This record establishes local evidence only, never production readiness.

## Final primary/fresh-review acceptance — local scope only

On 2026-09-30, primary review accepted Tasks2–5 for **local-build scope only**. Fresh independent review was clean after all three native corrections, with no Critical/Important findings remaining. The primary independently reran ads-selfcheck, inline-banner-selfcheck and the custom APK artifact guard (exit0); The then-current APK hash `18ACA356DE8B2A5E230E3C856AD0E1A0D9CBB15929C18C11991F5E51D17955BC` and source-manifest hash recorded above matched. Primary also confirmed diffcheck0, original previews5173/5174 HTTP200, and actual Home DEV390 placement/search suppression/Recents absence.

Task6 physical-device/publisher/production acceptance remains **NOT RUN and deferred**. This debug test APK is **not production delivery**. No product source, source manifest or APK changed for this acceptance receipt; no commit, push, installation or cleanup deletion was performed. The uncommitted candidate ledger/evidence is preserved. This self-report is excluded from the source manifest.


## 2026-10-02 scoped Git-delivery refresh

The user authorized **commit and push the banner feature on `codex/tools-inline-banner`**, not a merge/main push, PR, release or production enablement. A fresh audit found an empty index and all33 original reviewed source-manifest entries unchanged; historical approval/status prose in the approved design/plan and this validation receipt was normalized. The primary additionally approved removal of exactly one excess trailing empty CRLF line from `tests/browser/tools-inline-banner-selfcheck.mjs` to satisfy the newly staged diff check; all other bytes/encoding and one final CRLF newline were preserved. This was nonbehavioral test formatting, not an implementation fix, ID/version/SDK change or unrelated policy/icon edit. Origin is `https://github.com/shahzaib-574/pdf-suite`; after fetch, remote main remained at the source baseline and the feature branch did not yet exist remotely. Primary review gates the exact scoped staged tree before commit/push.

Fresh logs use prefix `delivery-2026-10-02-` in the local evidence directory above:

| Fresh command / gate | Result |
| --- | --- |
| inline-banner-selfcheck, ads-selfcheck, lint, `tsc -b`, dependency-selfcheck | exit0 (`controller`, `ads`, `lint`, `tsc`, `dependency` logs). |
| quality-selfcheck, pdf-selfcheck, docx-selfcheck | exit0 (`quality`, `pdf`, `docx` logs). |
| tools-inline-banner-selfcheck real React/Home + browser-selfcheck | exit0 (`react-browser`, `react-browser-final`, `browser-regression` logs); the focused real React/Home gate was rerun after the approved EOF-only trim;13UI, edge gate and8engine checks. Fake bridge/DEV placeholder only, not native proof. |
| website-selfcheck + website-policies-selfcheck | exit0 (`website-browser`, `website-policies` logs); website layouts/tool download and existing policy/icon links preserved. |
| `npm run build`, `npm run build:website`, `npm run android:sync:debug`, `npm run verify:ads -- --debug` | exit0 (`production-build`, `website-build`, `debug-sync`, `verify-ads` logs). Production build is web/static validation only; native production remains disabled. |
| `:app:testDebugUnitTest :app:compileDebugAndroidTestJavaWithJavac --rerun-tasks` | BUILD SUCCESSFUL46s;121 tasks executed,40JVM tests/0failures/0errors (`native-rerun` log). Instrumentation compiled **NOT RUN**. |
| `:app:testDebugUnitTest :app:compileDebugAndroidTestJavaWithJavac :app:assembleDebug` | BUILD SUCCESSFUL11s (`native-build` log); current debug APK identity/size/hash recorded above. No installation. |
| dependency graph, custom APK guard, supported identity reader, aapt2 permissions | exit0 (`native-dependencies`, `apk-check`, `apk-identity`, `permissions` logs); pins25.4.0/4.0.0, test ID/protocol/native host and production-off guard, package/version unchanged. Permission inventory identical to September30 proof. |

The existing warnings above remain; forced native compilation additionally exposed existing Filesystem Kotlin Java-type-mismatch warnings and an SDK XML-version mismatch warning. Existing JDK21.0.12.1/SDK36 were retained; no tooling/dependency upgrades were made. Initial free disk was19.7GB, later14.6GB before final APK; no cleanup/deletion performed. Temporary browser test servers were process-local opt-in/out only; original previews were recovered by primary and not stopped by the implementer.

**Local evidence only:** binaries, screenshots, logs, temporary files, `.superpowers` bookkeeping and unused generated icon/provenance output are not Git delivery. Their paths above are local references, not public links or required published artifacts; repository commands reproduce the checks. The approved design, plan, implementation/tests and this receipt are the intended scoped source delivery. Task6/device/publisher/production acceptance is still **NOT RUN/deferred**.
