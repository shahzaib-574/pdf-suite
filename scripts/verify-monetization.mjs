import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('monetization.config.json', 'utf8'));
assert.match(config.publisherId, /^pub-\d{16}$/);
assert.equal(config.developerWebsite, 'https://reampdfsuite.com');
assert.equal(config.androidPackage, 'com.reampdf.mobile');
assert.match(config.admobAppId, new RegExp(`^ca-app-${config.publisherId}~\\d{10}$`));
assert.match(config.admobBannerUnitId, new RegExp(`^ca-app-${config.publisherId}/\\d{10}$`));
assert.equal(config.adsenseClientId, `ca-${config.publisherId}`);
assert.equal(config.liveAdsEnabled, false, 'Enabling ad requests requires SDK, consent, privacy and release validation first.');
const line = `google.com, ${config.publisherId}, DIRECT, f08c47fec0942fa0`;
for (const name of ['ads.txt','app-ads.txt']) assert.equal(readFileSync(`public/${name}`, 'utf8').trim(), line);
if (process.argv.includes('--build')) {
  for (const name of ['ads.txt','app-ads.txt']) assert.equal(readFileSync(`dist-web/${name}`, 'utf8').trim(), line);
  assert.ok(readFileSync('dist-web/index.html', 'utf8').includes(`<meta name="google-adsense-account" content="${config.adsenseClientId}"`));
  assert.ok(readFileSync('dist-web/robots.txt', 'utf8').includes('Allow: /'));
}
console.log('Google ad prerequisites verified: matching public IDs, root seller files, and live ad requests disabled.');
