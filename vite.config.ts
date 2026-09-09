import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monetization from './monetization.config.json' with { type: 'json' }

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), {
    name: 'ream-release-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-metadata.json',
        source: JSON.stringify({ schemaVersion: 3, mode, advertising: false }) + '\n' })
      if (mode === 'website') {
        this.emitFile({ type: 'asset', fileName: '.htaccess', source: `Options -Indexes
DirectoryIndex index.html
<IfModule mod_headers.c>
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set X-Frame-Options "SAMEORIGIN"
<FilesMatch "\\.(html|json|webmanifest)$">
Header set Cache-Control "no-cache"
</FilesMatch>
<FilesMatch "^(app-ads|ads)\\.txt$">
Header set Cache-Control "public, max-age=300"
Header set Content-Type "text/plain; charset=utf-8"
</FilesMatch>
</IfModule>
AddType application/wasm .wasm
AddType text/javascript .mjs
` })
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nAllow: /\nSitemap: https://reampdfsuite.com/sitemap.xml\n' })
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://reampdfsuite.com/</loc></url><url><loc>https://reampdfsuite.com/privacy.html</loc></url></urlset>' })
      }
    },
    transformIndexHtml(html) {
      if (mode !== 'website') return html;
      return html.replace('<title>Ream - PDF Suite</title>', '<title>Ream PDF Suite — Free PDF tools in your browser</title>')
        .replace('Ream - PDF Suite. On-device PDF tools. Your files stay here.', 'Merge, split, compress, convert and protect PDFs with Ream. 12 free tools that process files in your browser without uploading your documents.')
        .replace('</head>', `<meta name="google-adsense-account" content="${monetization.adsenseClientId}" /><link rel="canonical" href="https://reampdfsuite.com/" /><meta property="og:title" content="Ream PDF Suite" /><meta property="og:description" content="12 PDF tools. Your files stay on your device." /><meta property="og:type" content="website" /><meta property="og:url" content="https://reampdfsuite.com/" /></head>`);
    },
  }],
  worker: { format: 'es' },
  server: { host: true, port: 5173 },
}))
