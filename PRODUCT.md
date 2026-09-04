# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: students and workers using a phone in motion — campus, commute, job site, or between classes. They open Ream to scan paper, convert PDF ↔ Word, and send a file before the next thing starts.

Privacy is a plus, not the job. Speed and a usable result are the job.

Other audiences (privacy-first users, small-business admin) are welcome but are not the design center.

## Product Purpose

Ream is a phone-first PDF suite: scan, read, convert, merge, split, compress, organize, watermark, number, and password-protect documents, then save or share them.

Success for the current phase: a Play Store listing with a signed Android App Bundle (`com.reampdf.mobile`), then a one-time Pro purchase. Success for a session: the user leaves with a file they can send.

## Positioning

Ream is a focused mobile PDF workspace whose first-run jobs are scan and PDF ↔ Word, not a web mega-toolkit. Neighboring cloud converters can copy tools; they cannot copy a fast phone flow that already has the camera, recents, and share sheet in thumb reach.

On-device processing is the current implementation and a marketing plus. It is not a hard product constraint. Cloud or server-assisted processing is allowed when it improves conversion quality, if the user can tell that a document is leaving the device.

## Operating Context

- Android app (`com.reampdf.mobile`, Capacitor 8 WebView) is the store product. The same React app also runs in a browser / PWA shell.
- Typical session: pick or capture → one tool → result → system save or share. Interrupted; one-handed; often on cellular.
- Documents are PDFs, DOCX, and camera/gallery images (JPEG, PNG, WebP). English OCR is bundled for scanned pages.
- Play Console, AdMob banners on Tools and Recents, and a public privacy policy are part of shipping, not of the document job.
- No Ream account exists today.

## Capabilities and Constraints

Shipped today:

- Tools: merge, split, images → PDF, PDF → images, compress, scan, organize, watermark, page numbers, protect (AES-256), view, Word → PDF (simplified), PDF → Word (layout rebuild + English OCR).
- Reader: continuous pages, search, outlines, thumbnails, pinch zoom, save/share.
- Recents in IndexedDB (20 items; files over 8 MB keep metadata only).
- Light / dark / system theme and a reduce-motion setting.
- Adaptive AdMob banners on discovery screens, UMP consent-gated.
- All tools unlocked. `pro` flags exist for a future paywall; they are not charged.

Confirmed product direction:

- Current goal: ship Play Store v1 as a signed Android App Bundle (`com.reampdf.mobile`) on an internal test track, then a production listing. One-time Pro via Play Billing is the next layer, not part of this cut.
- Shipping sequence for this goal: land the current app on `main` → fill GitHub `production` secrets → build the signed AAB → Play Console listing and declarations → internal-track device QA → production review.
- Feature quality outranks keeping every byte on-device. If conversion quality needs a server, use one and say so.
- iOS is not in the current goal.

Open:

- Exact Pro SKU, price, and which tools it gates.
- Whether a future cloud path is optional, default, or quality-tiered.
- Play target-audience / Families decision remains a publisher form, not a product-design fact.

Constraints:

- Android min SDK 24, target 36. Package ID is permanent after first Play upload.
- Hash-router SPA. No backend of Ream's own in the current tree.
- Current listing and privacy policy still describe on-device document processing. Changing that is a product + legal copy change, not a silent implementation change.

## Brand Commitments

- Name: **Ream**. Store title: **Ream: PDF Tools & Scanner**. Longer form: **Ream - PDF Suite**.
- Voice in shipped copy: short, practical, phone-native. Name the action. Do not use intern or paywall jargon for unlocked tools.
- Mark: `assets/logo.svg` and derived Play icon / feature graphic in `store-assets/graphics/`.
- Do not invent a different consumer brand or a cloud-suite name.

## Evidence on Hand

- Play listing copy and graphics: `store-assets/listing/en-US/`, `store-assets/graphics/`.
- Privacy policy (current on-device + AdMob disclosure): `public/privacy.html`, live at `https://shahzaib-574.github.io/pdf-suite/privacy.html`.
- Play declaration draft: `store-assets/PLAY_CONSOLE_DECLARATIONS.md`.
- No customer testimonials, reviews, benchmarks, or press quotes exist. Do not fabricate them.
- No production AAB has been built in GitHub Actions as of the last repo check; store screenshots are planned, not captured.

## Product Principles

1. **Get them a sendable file.** Scan, convert, and share beat exploring a catalog.
2. **Quality may leave the phone.** Prefer a better Word or OCR result over a local-only purity test; disclose when a document is uploaded.
3. **Play first, Pro second.** v1 is a complete unlocked Android app; billing is the next layer, not a v1 wall.
4. **Phone in motion.** One-handed, interruptible, thumb-zone actions; recents and share are part of the job.
5. **Copy matches behavior.** If processing moves off-device, listing and privacy change in the same release.

## Accessibility & Inclusion

No product-specific standard (WCAG target, captioning, or language set) was confirmed. The shipped app already has labeled controls, light/dark themes, and a reduce-motion setting; keep those unless a later requirement replaces them.
