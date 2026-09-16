import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monetization from './monetization.config.json' with { type: 'json' }

const googleAndroidTestBannerId = 'ca-app-pub-3940256099942544/9214589741'

function assertMonetizationConfig() {
  if (!/^pub-\d{16}$/.test(monetization.publisherId)) throw new Error('Invalid publisherId in monetization.config.json')
  if (!new RegExp(`^ca-app-${monetization.publisherId}~\\d{10}$`).test(monetization.admobAppId)) throw new Error('Invalid AdMob app ID')
  if (!new RegExp(`^ca-app-${monetization.publisherId}/\\d{10}$`).test(monetization.admobBannerUnitId)) throw new Error('Invalid AdMob banner ID')
  if (monetization.admobAppId.includes('3940256099942544') || monetization.admobBannerUnitId.includes('3940256099942544')) throw new Error('Google sample IDs are forbidden in production configuration')
  if (monetization.liveAdsEnabled !== true) throw new Error('Production AdMob release requires liveAdsEnabled=true')
}

assertMonetizationConfig()

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __REAM_AD_CONFIG__: JSON.stringify({
      bannerId: mode === 'android-debug' ? googleAndroidTestBannerId : monetization.admobBannerUnitId,
      testMode: mode === 'android-debug',
      liveAdsEnabled: mode !== 'website',
    }),
  },
  plugins: [react(), {
    name: 'ream-release-metadata',
    apply: 'build',
    generateBundle() {
      const nativeAds = mode === 'production' || mode === 'android-debug'
      const debugAds = mode === 'android-debug'
      this.emitFile({ type: 'asset', fileName: 'release-metadata.json',
        source: JSON.stringify({
          schemaVersion: 4,
          mode,
          advertising: nativeAds,
          ads: nativeAds ? {
            provider: 'google-admob',
            appId: monetization.admobAppId,
            bannerId: debugAds ? googleAndroidTestBannerId : monetization.admobBannerUnitId,
            isTesting: debugAds,
            consent: 'google-ump',
            maxAdContentRating: 'G',
            tagForUnderAgeOfConsent: true,
          } : null,
        }) + '\n' })
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
