# Website policy drafts: evidence and release review

Drafted 2026-09-30. These pages are **review drafts**, not a worldwide compliance determination. No publication or legal certification was performed.

## User-confirmed facts

- Individual developer, not an incorporated organization.
- Public developer name: shahdotdev (an alias; do not assume this satisfies legal identity disclosures).
- Country: Pakistan.
- Selected host: Hostinger.
- Support/privacy email: info@reampdfsuite.com.

## Shipped draft scope

- `public/website-privacy.html`: website processing, local files, hosting request metadata, correspondence, retention unknowns, security, international access and conditional rights.
- `public/website-cookies.html`: code-grounded browser-storage inventory and clearing instructions. No invented analytics/ads cookie banner and no blanket consent exemption.
- `public/website-terms.html`: proposed service terms, acceptable use, content ownership, output verification, security/storage limits and mandatory statutory-rights saving.
- Website footer and website-only Settings link to these drafts. `public/privacy.html` and the native Settings privacy URL remain unchanged for the Android app/store.
- Each draft is visibly labeled and carries `noindex, nofollow`; that is an indexing request, not access control. Static files are copied to either Vite build by the public-assets mechanism, but native UI never links to the website drafts.
- No refund/subscription policy, DMCA-agent registration, fictitious company/address, forced arbitration, jurisdiction selection or accessibility certification added.
- User subsequently rejected generated icons and asked to skip them. Existing website and native icon systems are untouched; generated exports are unused in `output/imagegen/unused-tool-icons/`, not public assets. Originals and provenance are preserved. Do not publish these rejected assets.

## Verified source evidence

- `src/web/WebHome.tsx`: 12 website tools, scan excluded from catalog; original SVG/Lucide icons retained.
- `src/web/platform.ts`, `.env.website`: separate website mode.
- `src/store/recents.ts`: `pdf.library.v2` metadata and `pdf.file.<id>` bytes in IndexedDB, legacy `pdf.recents` migration, 200-item/512-MB limits, explicit delete/clear; clearing the library does not clear all IndexedDB records.
- `src/store/scanDraft.ts`: local draft metadata/image bytes in `ream-scan-draft-v1` and `ream-scan-draft-files-v1` if shared scanner route is used.
- `src/theme/ThemeProvider.tsx`: `pdf.theme`, `pdf.reducedMotion` localStorage preferences.
- `src/store/entitlements.ts`: `pdf.pro` local availability compatibility flag, current tools unlocked, not an actual payment/account.
- `src/pdf/ocr.ts`: local worker/core/language URLs; Tesseract language caching remains local.
- `src/pdf/render.ts`, `src/pdf/fonts.ts`: bundled local PDF.js WASM/fonts/CMaps and rendering data supplied from local bytes.
- `src/ads/admob.ts`: native Android-only initialization gate; no website ad script.
- `src/store/updates.ts`: native-only OTA request path, not website activity.
- Current first-party source scan found no document-upload endpoint, `document.cookie` writes, analytics tracker, tracking pixel or web payment/account service. This does **not** prove hosting has no additional scripts, cookies or logs.
- Settings clearing UX: Preferences → Privacy & storage → **Clear recent files** → confirm **Clear files**. Exported copies and browser appearance preferences survive library clearing.

## Current primary sources reviewed

Primary agent verified these official sources on 2026-09-30; they inform conditional review gates, not a claim that every law applies to every visit.

- EU Commission GDPR applicability: <https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en>
- EU Commission obligations/notice: <https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en>
- UK ICO storage/access technologies (includes non-cookie browser storage): <https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/>
- California AG CCPA applicability and rights: <https://oag.ca.gov/privacy/ccpa>
- FTC COPPA audience/child-information applicability: <https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions>
- Hostinger privacy: <https://www.hostinger.com/legal/privacy-policy>
- Hostinger DPA: <https://www.hostinger.com/legal/dpa>

## Required before public release / removing draft status

- [ ] Confirm legal operator identity and any required service-provider contact/address disclosure. Public alias is not verified legal identity.
- [ ] Confirm production domain, the actual Hostinger product/account, region, subprocessors and any CDN/security integrations.
- [ ] Inspect deployed responses and a clean-browser network/storage session: host cookies, injected scripts, request logs and transfer destinations. Local preview does not validate Hostinger production behavior.
- [ ] Record hosting access/security controls, log retention/deletion, purposes, legal bases, contracts/DPA and any needed international transfer safeguards. Do not invent retention periods or regions.
- [ ] Confirm mailbox provider, retention schedule, access controls and a privacy-request/deletion handling procedure.
- [ ] Review Pakistan's applicable requirements and the territories actually targeted; assess EU/UK/US state law applicability, representative obligations if applicable, children's privacy, consumer disclosures and mandatory rights. No universal one-size-fits-all list is asserted.
- [ ] Assess each browser-storage purpose under applicable access/storage rules, especially automatic `pdf.pro`, local library and scanner draft writes; implement choices/gating where required before effective publication. No blanket “everything is essential” claim.
- [ ] Confirm audience/age handling and support handling of minors' information; avoid unsupported COPPA claims.
- [ ] Review contractual enforceability, correct notice/acceptance method, liability language and mandatory consumer rights. No automatic acceptance assumed for these drafts.
- [ ] Confirm accessibility issues and support process; no WCAG conformance claim without a proper audit.
- [ ] Complete qualified legal review, set real effective dates, remove draft/noindex status only deliberately, and deploy reviewed files. No deployment was part of this task.
- [ ] Before new uploads, accounts, payment, analytics, advertising or provider changes, update policies and implement the appropriate controls in the same release.

## Validation commands

`node tests/browser/website-policies-selfcheck.mjs` exercises actual policy URLs/links/draft status, four widths, clearing control labels and native-vs-website isolation. `node tests/browser/website-selfcheck.mjs` covers the existing website routes, filters, themes, merge and download. Both default to running previews on 5174/5173; no existing server is killed or replaced.

Fresh lint/typecheck/build and local PDF/Word/storage selfchecks are part of the handoff. Their exact observed outcomes are reported separately; source review or a policy page does not establish production legal compliance.

### Observed local validation, 2026-09-30

- TDD linkage red: policy browser test first failed because the website footer had no website-privacy link; green after implementation. Prose itself is reviewed rather than tested by source-string matching.
- `npm run lint`: exit 0, no errors; existing `react(set-state-in-effect)` warnings in unchanged `src/screens/Viewer.tsx` at lines 325, 664 and 1511.
- `npm run build:website` and `npm run build`: fresh final passes, including `tsc -b`. Both report existing >500-kB chunks and the ineffective dynamic import of `src/store/incoming.ts` (also statically imported). These are Vite web/native-shell builds, not Android Gradle/device builds.
- `node tests/browser/website-policies-selfcheck.mjs`: pass — all three live pages/links/draft metadata, 360/390/768/1440 widths, system dark theme, real two-step clearing controls and native-policy/icon isolation. Screenshots in `tmp/website-policy-review/`; final build logs there too.
- `node tests/browser/website-selfcheck.mjs`: pass — 12 tool routes, search/filter/navigation/themes, responsive widths and real two-page merge/download.
- `npm run quality-selfcheck`: pass — storage migration/concurrency/retention and document edge checks; four existing PDF.js `standardFontDataUrl` warnings in the Node harness.
- `npm run pdf-selfcheck`: pass — PDF tool fixtures.
- `npm run docx-selfcheck`: pass — document generation, PDF/DOCX packaging, OCR packaging and table fidelity.
- `npm run browser-selfcheck`: pass — 13 tool/UI journeys, edge tests and eight engine checks. The engine run emitted Vite HMR websocket connection/send warnings on the existing development preview; no test failed and no document-processing external requests were reported by its UI harness.
- `npm run product-quality-selfcheck`: pass — scanner/drafts/recovery, conversions/notes/RTL, grayscale previews, crop handles and actual styled-table/image conversion fidelity.
- `npm run ads-selfcheck`: pass — existing modes/IDs/consent/route policy.
- Impeccable mechanical detector on changed UI/pages: `[]`.
- `git diff --check`: pass (Git notes configured LF→CRLF normalization).
- Static page/CSS hashes matched public files in both builds; rejected generated icons were absent from public and website build paths. `public/privacy.html`, native icon definitions and website icon CSS have no diff.
- Existing previews on ports 5173 and 5174 remained running. No commit, push, deploy, SDK installation or native-app advertising implementation was performed.
