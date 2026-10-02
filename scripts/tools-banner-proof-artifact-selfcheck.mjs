import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const config = JSON.parse(readFileSync('monetization.config.json', 'utf8'));
const testId = 'ca-app-pub-3940256099942544/9214589741';
const apkPath = 'android/app/build/outputs/apk/debug/app-debug.apk';
assert(existsSync(apkPath), 'debug proof APK required');
const apk = await JSZip.loadAsync(readFileSync(apkPath));
const metadata = JSON.parse(await apk.file('assets/public/release-metadata.json').async('string'));
assert.equal(metadata.schemaVersion, 4);
assert.equal(metadata.mode, 'android-debug');
assert.equal(metadata.ads.bannerId, testId);
assert.equal(metadata.ads.isTesting, true);
assert.equal(metadata.ads.consent, 'google-ump');
assert.equal(metadata.ads.maxAdContentRating, 'G');
assert.equal(metadata.ads.tagForUnderAgeOfConsent, true);
const jsFiles = Object.values(apk.files).filter(f => /^assets\/public\/.*\.js$/.test(f.name));
const js = (await Promise.all(jsFiles.map(f => f.async('string')))).join('\n');
assert(js.includes(testId));
assert(!js.includes(config.admobBannerUnitId), 'production banner unit must not be in proof web assets');
assert(js.includes('data-tools-banner-slot'), 'real product React slot required, obsolete probe is not integration');
assert(!js.includes('data-tools-banner-probe') && !js.includes('Development ad placeholder') && !js.includes('Fixture — mocked bridge'), 'APK must exclude proof/preview/test entry points');
const dex = (await Promise.all(Object.values(apk.files).filter(f => /^classes\d*\.dex$/.test(f.name)).map(f => f.async('nodebuffer')))).map(b => b.toString('latin1')).join('\n');
assert(dex.includes('ToolsBannerPlugin') && dex.includes('ToolsBannerHost'), 'native host/plugin must be packaged');
const buildConfig = readFileSync('android/app/build/generated/source/buildConfig/debug/com/reampdf/mobile/BuildConfig.java', 'utf8');
assert(/TOOLS_INLINE_BANNER_PRODUCTION_VERIFIED\s*=\s*false/.test(buildConfig), 'native production gate must be false');
function jsIn(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory()?jsIn(path.join(dir,e.name)):/\.js$/.test(e.name)?[readFileSync(path.join(dir,e.name),'utf8')]:[]); }
if (existsSync('dist-web')) {
  const website=jsIn('dist-web').join('\n');
  assert(!website.includes('Native test-ad proof') && !website.includes('data-tools-banner-probe'), 'website must exclude proof');
}
console.log('TOOLS_BANNER_PROOF_ARTIFACT_OK debug-only test-id native-host production-gate=false');
