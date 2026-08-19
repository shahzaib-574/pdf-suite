# Ream - PDF Suite

On-device PDF tools. Files never leave the phone or browser. Phase 1 for a later Play Store wrap (Capacitor).

## Stack

- Vite + React + TypeScript
- GSAP (`@gsap/react`) for press/stagger on transforms only
- `pdf-lib` in a Web Worker (merge, split, images→PDF, watermark, numbers, organize)
- PDF.js on the main thread (view, compress, PDF→images)

## Run

```bash
npm install
npm run dev
```

Open the local URL on your computer or phone (same Wi‑Fi).

## Tools in phase 1

Merge, split, images→PDF, scan (camera), compress, organize, watermark, page numbers, view, PDF→images, Word → PDF (DOCX, simplified, on-device).

Protect is listed but **cannot encrypt** until we add an engine that supports it. The screen says so.

## Next

- Capacitor Android shell + Play listing
- One-time Pro via Play Billing
- Real password encrypt
