# Tools-page scrolling AdMob banner — approved local design

Date: 2026-09-30

Status: **Reviewed design approved for local implementation; local candidate accepted by primary/fresh review on 2026-09-30.** The approved implementation plan was completed through its local build gates. Physical-device/publisher acceptance has not run and native production display remains disabled. On 2026-10-02 the user separately authorized scoped commit/push to the feature branch; this does not authorize installation, production enabling, signing, OTA or store release.

## 1. Intent and agreed experience

Move the existing Android AdMob banner into the Tools/home page, immediately after the **Recent files** section (including its empty state) and before **All tools**. It should appear to move with that page, not remain fixed to the bottom of the app. Remove the old bottom-anchored placement and the separate Recents-page placement.

The agreed sequence is search, quick actions, Recent files, ad when available, All tools. Interpret “under Recent files” as after the entire list/empty state, not between its heading and rows. This remains true with zero or several recent files. The navigation bar stays at its ordinary bottom position.

The banner is Android-native and Tools-only. It is absent on the website, ordinary browser previews, Recents, Settings, Viewer, Results, all individual tool flows, and while search or incoming shared-file selection is active. No new ad formats or IDs are introduced.

Success means correct placement and safe scrolling/touch behavior on Android, no underlying controls covered, no requests caused by scrolling, no duplicate old banner, consent preserved, and usable tools when ads fail. A browser screenshot alone cannot establish those facts.

## 2. Important architectural distinction and feasibility boundary

The UI is React inside a Capacitor WebView. An Android `AdView` cannot be inserted as a child of an HTML element. The proposed solution is a **native ad view synchronized to a reserved DOM slot**, with a clipped native host occupying that slot's current visible rectangle. It is not a DOM-inline ad or a single shared native scrolling hierarchy. “Scrolling banner” describes the intended experience, not a guarantee of perfect cross-renderer compositing.

The installed `@capacitor-community/admob` 8.1.0 banner API only offers top/center/bottom anchoring and margin. Its Android `BannerExecutor` uses anchored adaptive sizing and adds a native sibling above the WebView. Calling `showBanner` repeatedly does not relocate an existing view; it requests another load. Do not implement a scroll-driven `showBanner`/margin workaround or modify `node_modules`.

Use a small app-owned Capacitor plugin with the **existing Google Mobile Ads SDK and UMP**, while retaining the existing community plugin for initialization and consent forms. Google provides an inline-adaptive sizing API for scrolling banners, including a maximum-height option. This supplies ad dimensions; it does not solve WebView/native positioning. [Google inline-adaptive guide](https://developers.google.com/admob/android/banner/inline-adaptive)

**Feasibility gate:** native scroll synchronization, gesture ownership, and clipping must be demonstrated using Google test ads before retaining the feature for production. If alignment or gesture safety cannot be demonstrated, leave the ad disabled and collapsed. Do not silently substitute an anchored banner or claim a true inline implementation. A fully shared native scroll hierarchy would require a separately approved screen redesign and is outside this spec.

## 3. Scope, exclusions, and native capability

In scope: one DOM slot; one native host/AdView; Tools-only policy; existing consent lifecycle; measured height; geometry and touch safeguards; test-ad validation; updating placement documentation and validators.

Out of scope: SDK/plugin upgrades, iOS support, interstitial/rewarded ads, production ad clicks, new publisher configuration, new runtime permissions, document uploads, replacing React/native navigation, release signing, Play submission, and automatic rollback to the old placement.

The new plugin requires a **new native APK/AAB**. Existing installations receiving only an OTA web update cannot gain the native host. The JS facade performs a capability/version check; missing/older native support means no slot and no ad, without crashing or falling back to the old banner. Do not publish a web-only OTA claiming this native change is delivered. Existing signed OTA authority and app identity remain unchanged.

## 4. Ownership and prospective file changes

The paths below define the approved banner implementation ownership. The local implementation was accepted on 2026-09-30; device/production acceptance remains outstanding. Preserve unrelated edits.

Workspace root: `C:\Users\Macbook Pro 2019\pdf-suite`.

| File beneath that root | Responsibility |
| --- | --- |
| `src/screens/Home.tsx` | Add slot immediately after the Recent files section (current line 235), before All tools (237); pass search eligibility. No ad inside recent rows. |
| `src/ads/ToolsBannerSlot.tsx` (new) | DOM slot lifecycle, observers, geometry acknowledgments, height, native-only eligibility; no publisher script or clickable fake creative. |
| `src/ads/inlineBanner.ts` (new) | Typed plugin facade, capability negotiation, session/revision/geometry synchronization and cleanup. |
| `src/ads/admob.ts` | Keep SDK/UMP initialization/privacy helpers; replace community banner ownership with the new host. Consent transitions destroy the custom host before presenting forms. |
| `src/ads/policy.ts` | Replace home-or-recents policy with explicit home/non-search/non-incoming selection policy. |
| `src/App.tsx` | Central route/incoming eligibility and teardown; remove old discovery-banner effect; retain startup consent and Settings privacy UI. |
| `src/index.css`, `src/screens/screens.css` | Remove native bottom-gap/nav-offset rules; add isolated slot styles. Other safe-area/nav/reader/camera behavior remains intact. |
| `android/app/src/main/java/com/reampdf/mobile/ToolsBannerPlugin.java` (new) | Capacitor methods, consent/asset validation, UI-thread lifecycle, AdView request/events and native capability. |
| `android/app/src/main/java/com/reampdf/mobile/ToolsBannerHost.java` (new) | Small clipped host, viewport geometry, native scroll tracking, touch safeguards. Keep pure geometry calculation separable for tests. |
| `android/app/src/main/java/com/reampdf/mobile/MainActivity.java` | Register the local plugin alongside existing file/camera plugins; do not alter app-back behavior. |
| `android/app/build.gradle` | If needed for app compile visibility, explicitly reference the same existing ads/UMP coordinates pinned by `android/variables.gradle`; no new SDK family/version. Never edit generated `capacitor.build.gradle`. |
| `scripts/ads-selfcheck.ts`, `scripts/verify-ads.mjs`, new focused TS/Android unit/browser/instrumentation tests | Update old banner assumptions, assert request/geometry/policy and artifact gates. Keep existing production ID, consent and test-mode checks. |
| `public/privacy.html`, `README.md`, `docs/internal-testing.md`, affected placement/testing docs | Replace stale Tools-and-Recents placement claims; document custom host and actual device evidence. No new legal compliance claims. |

Do not edit `monetization.config.json` identifiers, signing files, OTA keys, `node_modules`, generated assets, store metadata, or release versioning during implementation except under separately approved release work. Preserve app package ID `com.reampdf.mobile`.

## 5. Consent and a single banner owner

Keep existing UMP refresh/form/privacy-options flow and conservative under-age-of-consent/General-content configuration. Both native request and display require current native UMP `canRequestAds()`, SDK initialization, native Android, advertising-enabled bundle metadata, approved mode/ID, eligible home route, active foreground, and an active slot session. A JS boolean alone must not authorize a request.

Native host reads the active packaged/Capacitor-served bundle's existing release configuration via an explicitly validated mechanism; the build verification must prove it matches `__REAM_AD_CONFIG__`. Do not assume filesystem assets automatically follow OTA updates. If authoritative active-bundle configuration cannot be identified, fail closed rather than accepting arbitrary JS IDs. Native configuration/capability handshake should expose only non-secret mode/enablement facts. Production uses the existing production unit; `android-debug` uses the existing Google test banner unit. Host configuration must preserve the existing SDK RequestConfiguration, not reset UMP or audience handling. Verify public SDK/UMP APIs, not internal community-plugin helpers. [UMP setup and request eligibility](https://developers.google.com/admob/android/privacy)

Remove community `showBanner` calls and banner listeners from the product path. At migration/startup, await `AdMob.removeBanner()` once to clean up any old plugin view before starting the custom owner; no repeated removal on scroll. Failure to confirm cleanup disables the new host for that session. No simultaneous old and new banner is acceptable.

Entering Settings/privacy options, revoking eligibility, unmount, route change, or incoming selection increments the session generation and hides/disables touch immediately, then destroys the ad. Late load/layout callbacks for retired generations are ignored. Privacy forms must never compete with an ad overlay. A later eligible entry can start a fresh generation after consent is refreshed. Existing consent-error behavior stays conservative and tools remain available.

## 6. Minimal plugin contract and state machine

App-owned plugin name: `ToolsBanner`, capability protocol version 1. Methods and events are contracts, not code stubs:

- `getCapabilities`: reports supported protocol/native host and active validated advertising mode.
- `prepare`: accepts generation, valid initial width geometry and Tools eligibility. Native independently checks consent/configuration. Creates at most one unloaded/loaded AdView and requests at most once for that generation/width. Cannot make a visible or touchable host.
- `updateGeometry`: accepts generation, monotonic sequence, slot viewport rectangle, document scroll origin, layout/visual viewport metrics, WebView/slot bounds and known occlusion bounds. No loading/request APIs in this path.
- `hide`: immediately makes the host non-visible/non-interactive and invalidates display acknowledgment; preserves a loaded creative only for temporary offscreen/geometry suppression in the same eligible generation.
- `destroy`: idempotently invalidates the generation, removes listeners/view, destroys AdView, clears native geometry and reports height zero.
- `stateChanged` event: generation, load/error status, measured creative height and width in native pixels plus validated CSS conversion, and capability/geometry errors. Geometry-acceptance acknowledgments include the applied sequence. Never expose document names/content or private consent identifiers.

States: inactive, preparing/loading-hidden, loaded-awaiting-slot-ack, visible, temporarily-hidden, failed, destroyed. Requests occur only after capability/config/consent eligibility and a positive slot width. A zero-height slot may provide width for preparation. Once load and native measurement succeed, JS reserves measured height, remeasures, and acknowledges the actual reserved rectangle before visibility/touch can begin. This two-phase handshake avoids covering All tools during loading. If height is zero/invalid or larger than its approved bound, do not render.

Use inline-adaptive sizing with **maximum height 100 dp** for this compact banner placement and slot-inner width converted to dp, not the device's full width. The maximum is a design choice, not a fixed creative height. Treat incompatibility with the selected SDK/creative as failure, not permission to crop it. Measure the loaded view after layout; reserve its actual rendered height, never a guessed 50/100-pixel gap. Ordinary scrolling never calls `loadAd`, recreate, hide/resume through the community plugin, or UMP refresh. SDK-managed refresh is not an app scroll request. Width/orientation change can destroy/reprepare once after geometry settles; deduplicate identical widths and never spin an orientation-request loop.

## 7. Geometry, bounded host and scrolling

Use one small native host under the existing root container, above the WebView but not above arbitrary native dialogs. Its visible/touchable frame must be bounded to the ad's slot intersected with the visible WebView area, safe viewport, and region above navigation; no full-screen transparent touch layer. Enable child clipping. Do not crop/stretch the loaded creative to fake a match. Initially show only when the entire creative fits within the valid unobstructed slot; hide when any part would intersect navigation, keyboard, offscreen edges, or a modal. This conservative visibility rule prevents partial-click/occlusion problems while the slot itself continues to scroll.

JS samples `getBoundingClientRect` plus layout and visual viewport state using ResizeObserver, captured/passive scroll listeners and one coalesced requestAnimationFrame update. Track font/layout/recent-list changes, slot height changes, window resize, visualViewport resize/scroll, visibility/pagehide and route transitions. IntersectionObserver may help eligibility, but is not geometry authority. Support the real page scroll source; never assume only `window.scrollY` changes. If a nested scroller cannot be mapped safely, hide until fresh verified geometry arrives.

Native records WebView/root window origins, viewport size, density and native scroll position at each accepted sample. Convert CSS pixels to physical view pixels with a validated mapping using actual WebView/layout/visual viewport dimensions; convert only native ad-size API arguments to dp. Do not multiply CSS pixels by density alone or double-apply Android edge-to-edge insets. Reject NaN, infinities, negative/oversized dimensions, obsolete generations/sequences or unvalidated scales. Use actual native WebView/root/inset measurements to cross-check JS geometry and safe bounds.

A native scroll/pre-draw observer updates the small host's translation from the last valid document anchor and native WebView scroll delta on the UI thread, without an ad request or JS round-trip on every native frame. JS remeasurement corrects layout/nested-scroll changes. Preserve existing listeners; do not replace Capacitor's WebView listeners or root inset handling. Fast scroll, pinch/zoom, layout movement or ambiguous mapping immediately disables hit testing; if the native mapping cannot be kept trustworthy, hide until a fresh acknowledged sample. Treat **50 ms while scrolling or one detected geometry discontinuity** as a conservative stale-display limit, using native monotonic timestamps (not an untrusted JS wall clock). No promise that this number alone establishes safety; instrument and tighten it on devices.

An otherwise valid geometry sample does not expire merely because the page is idle. Loss of viewport/foreground/lifecycle validity does invalidate it. Android IME visibility/focused input hides the host; search hides it independently. Keyboard dismissal/orientation/scale change requires fresh viewport acknowledgment before redisplay. Large-font/display scaling, API 36 edge-to-edge and landscape need explicit evidence. Unrepresentable pinch zoom stays ad-free, not misaligned.

## 8. Touch, accessibility and UI safety

Outside the small host's exact visible bounds, touches go to the WebView normally. When hidden, stale, loading, clipped or retired, host is non-interactive and not exposed as a duplicate accessibility target. The DOM slot is non-clickable, has no custom call-to-action, and does not imitate an ad creative. Preserve Google's native accessibility/attribution rather than duplicating native content in HTML.

Within a visible ad, ordinary taps belong exclusively to the SDK view. Never generate ad taps, forward a consumed ad tap to underlying controls, or put a clickable wrapper around the ad. Swipes starting on the ad are a feasibility gate: a host parent may intercept only after normal Android touch-slop confirms a vertical drag, cancel the child gesture, and hand a coherent drag stream to the WebView without creating a click. It must respect horizontal/SDK interactions, multipointer cancellation, accessibility and native WebView scroll ownership. This gesture handoff is not assumed safe merely because it compiles. If the SDK/native hierarchy cannot support it without breaking ad interaction or page scrolling, fail the feature gate and keep ads off pending revised design. Do not leave a dead scroll area or silently make ad content click-through.

Keep a modest non-clickable separation from recent-file buttons and All tools. Show a small neutral “Advertisement” label only with a loaded ad, outside the creative and without covering SDK attribution; include that label/separation in reserved slot geometry. No no-fill placeholder remains. Device testing must confirm label placement is not misleading. Placement safety and publisher policy acceptance remain external checks, not guaranteed by this spec.

## 9. Failure, offscreen and lifecycle behavior

Consent denial/error, no-fill, SDK failure, unavailable native capability, invalid configuration, timeout, invalid measurement or unsupported geometry: hide/destroy as appropriate and collapse slot/label/separation to zero. Tools and navigation remain functional. Do not retry on every scroll, rerender or ResizeObserver callback. No-fill retries only on a later eligible route-entry generation, with a minimum 60-second per-session backoff; consent/configuration failures do not retry until their state changes.

After a successful load, merely scrolling the slot offscreen hides the host but retains its measured DOM height and loaded ad in the same generation to prevent scroll jumps/reloads. Geometry safety suppression similarly retains height briefly while reacquiring geometry; a persistent protocol failure (1 second) destroys and collapses once. Distinguish suppression from no-fill. Width/orientation changes require one reprepare and may change slot height once, not repeatedly. Pause/background hides and pauses AdView; resume only after consent eligibility, fresh geometry and generation are valid. Activity/plugin destroy must destroy AdView and remove every observer/listener; never leak Activity or queued callbacks. [Google banner lifecycle/test-ad guide](https://developers.google.com/admob/android/banner)

There is no runtime fallback to bottom anchoring. A separately reviewed rollback can disable the feature entirely. Existing native apps lacking this bridge degrade to no banner after the corresponding web migration.

## 10. Browser behavior

Default browser/mobile-browser and public website: no native ad, no blank slot, no fake production creative, no new Google display scripts. For layout QA only, a later implementation may provide **explicit development-only opt-in**, e.g. `import.meta.env.DEV && VITE_REAM_INLINE_AD_PREVIEW === 'true'`. Render a visibly labelled “Development ad placeholder — not a real ad”, non-clickable, in the intended slot with deterministic test heights. Never enable this through an arbitrary production query string; build/artifact tests must exclude the preview from production/website artifacts. Browser preview does not validate native requests, consent, gesture handoff, alignment or SDK behavior.

## 11. Test strategy and acceptance gates

Write failing tests before product changes after implementation-plan approval. Evidence is tied to the exact candidate revision, not this design's audit.

1. **TS policy/controller tests:** Tools only; zero/multiple recents; search and incoming chooser suppression; every excluded route; unknown capability; denied consent; stale generation/load; size acknowledgment; no-fill collapse; offscreen height retained; scroll never loads; width deduplication; backoff; cleanup; dev preview disabled by default.
2. **Pure native geometry/session tests:** scale/density/insets conversion, window-origin offsets, invalid bounds, sequence/generation rejection, clip/occlusion decisions, stale detection, foreground/IME invalidation and lifecycle cleanup. Keep ad request count assertions separate from SDK-managed refresh.
3. **Browser mock protocol tests:** insertion order, searching/empty-state, measured-height handshake, ResizeObserver changes, navigation restored with no `--native-ad-height` offset, no duplicate old callsites, strict-mode mount/unmount, mocked geometry failure. Clearly label mocked tests; do not count them as Android evidence.
4. **Build/static/artifact gates:** current lint/TypeScript/build and ad selfchecks; adjust verify-ads for custom host rather than deleting constraints. Android Java compile and unit tests; debug test-ad APK; verify dependency graph has only existing pinned SDK/UMP versions and unchanged permissions/package ID. Preserve production metadata/test-ID exclusion/audience settings and existing R8/signing safeguards. Build only after checking free disk again. Capacitor sync generates files and is an implementation activity, not part of this spec audit.
5. **Android device/instrumentation gates:** Google test ads only; empty/non-empty recent section; portrait/landscape, small/large fonts, multiple density/screen sizes, API 36 edge-to-edge plus at least one supported older Android; load/no-fill/offline; consent required/denied/changed; native back/routes; IME; fast fling/reverse fling; drag beginning on the ad; stationary legitimate SDK interaction; visual zoom; partial/offscreen; rotation during load; background/resume; activity recreation; incoming share overlay; accessibility focus. Confirm no underlying recent/tool/navigation control can be activated through or accidentally by the ad. No production ad clicks.
6. **Durable evidence:** record video/screenshots for placement/scroll/keyboard/gesture cases, test mode and device/API/viewport, request counters correlated to transitions, absence of old banner, memory/lifecycle checks and exact-head logs. Keep document data and consent identifiers out of evidence/logs. Publisher validates actual ad serving/account and placement compliance separately.

**Release blocker:** native synchronization and swipe-from-ad tests must pass on physical Android hardware. Emulator/browser evidence alone is insufficient. If those checks fail or hardware is unavailable, report implementation as unverified and do not claim the requested scrolling banner is production-ready.

## 12. Read-only environment audit (2026-09-30)

- Initial Git working tree was clean; no on-disk `AGENTS.md` was found in the workspace or checked ancestors. Follow the user-supplied Sol/high orchestration/review instruction.
- Existing `node_modules` include AdMob plugin 8.1.0. Android pins Google Mobile Ads 25.4.0 and UMP 4.0.0 in `android/variables.gradle`; SDK levels are minimum 24, compile/target 36. Generated app Gradle configuration currently references the community plugin; app-owned Java SDK imports may need explicit declarations of those same coordinates for compile visibility.
- `$JAVA_HOME` Java executable exists and reported Temurin OpenJDK 21.0.12.1. Android SDK directory, API 36 platform, build-tools 36.0.0 and ADB executable exist. Gradle wrapper/cache directory exists. No Gradle dependency-resolution/compile/build was run, so a working build toolchain is **not proven**.
- C: had approximately 25.6 GB free at audit time. Recheck before any build/sync; preserve unrelated files.
- `adb devices -l` returned no devices. This inventory started the standard ADB daemon; no emulator, SDK component, APK or dependency was installed. Physical-device acceptance is currently unavailable.
- Website server 5174 and app server 5173 from the prior preview are left untouched. Those previews cannot exercise this native host.

## 13. Design self-review and approval handoff

Self-review checklist: agreed location/scope explicit; one owner/no old ad; no IDs upgraded; no dependency/node_modules edits in this design; native-vs-DOM distinction explicit; measurement-before-display and no-fill collapse defined; clipping/touch/stale geometry safeguards specified; no per-scroll reload; density/insets/IME/orientation/lifecycle covered; browser opt-in is dev-only; signed OTA/new APK limitation explicit; physical-device and publisher gates separated from local tests.

Open engineering risks are the cross-renderer positioning/gesture proof and authoritative active-bundle configuration under signed OTA. They are **fail-closed feasibility gates**, not permission to improvise production behavior. The implementation plan must start by verifying those contracts before committing to retained integration. If a capability/configuration mechanism differs from this spec, revise the spec for approval first.

Approval record: the user approved the written design and implementation plan, selected local-only execution, and primary/fresh review accepted the local candidate on 2026-09-30. The separate 2026-10-02 request authorizes scoped feature-branch commit/push after fresh validation and primary staged review. Physical-device, publisher and production release gates remain outstanding; they are not satisfied by Git delivery.

## Sources

- [Capacitor v8 Android plugin guide](https://capacitorjs.com/docs/plugins/android): app-owned plugin methods and event bridge.
- [Google inline-adaptive banners](https://developers.google.com/admob/android/banner/inline-adaptive): scrolling format, width selection and maximum height.
- [Google Android UMP](https://developers.google.com/admob/android/privacy): consent eligibility.
- [Google Android banner guide](https://developers.google.com/admob/android/banner): SDK view lifecycle and test-ad usage.
- Installed source audit: `node_modules/@capacitor-community/admob/dist/esm/banner/` and Android `BannerExecutor.java`; current `src/ads/`, `Home.tsx`, `App.tsx`, `index.css`, and Android Gradle/MainActivity files. The installed local version, not upstream main, determines the plugin limitations above.
