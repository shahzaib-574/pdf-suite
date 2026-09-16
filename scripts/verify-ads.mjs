import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const read = (file) => readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const GOOGLE_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/9214589741';
const requestedMode = process.argv.includes('--debug') ? 'android-debug' : 'production';
const config = json('monetization.config.json');

assert.match(config.publisherId, /^pub-\d{16}$/);
assert.equal(config.androidPackage, 'com.reampdf.mobile');
assert.match(config.admobAppId, new RegExp(`^ca-app-${config.publisherId}~\\d{10}$`));
assert.match(config.admobBannerUnitId, new RegExp(`^ca-app-${config.publisherId}/\\d{10}$`));
assert.equal(config.liveAdsEnabled, true);
assert(!config.admobAppId.includes('3940256099942544'), 'Production app ID is a Google sample ID');
assert(!config.admobBannerUnitId.includes('3940256099942544'), 'Production banner ID is a Google sample ID');

const pkg = json('package.json');
assert.equal(pkg.dependencies['@capacitor-community/admob'], '8.1.0');
const lock = json('package-lock.json');
assert.equal(lock.packages[''].dependencies['@capacitor-community/admob'], '8.1.0');
assert.equal(lock.packages['node_modules/@capacitor-community/admob'].version, '8.1.0');

const source = read('src/ads/admob.ts');
assert(source.includes('MaxAdContentRating.General'));
assert(source.includes('initializeForTesting: true'));
assert(source.includes('initializeForTesting: false'));
assert(!/tagForChildDirectedTreatment\s*:/.test(source));
assert.equal((source.match(/tagForUnderAgeOfConsent:\s*true/g) ?? []).length, 2);
assert(source.includes('BannerAdSize.ADAPTIVE_BANNER'));
assert(source.includes('BannerAdPluginEvents.SizeChanged'));
assert(source.includes('BannerAdPluginEvents.Loaded'));
assert(source.includes('consent.canRequestAds'));

const debugEnv = read('.env.android-debug');
assert.match(debugEnv, /^VITE_ADMOB_TEST_MODE=true$/m);
assert(!debugEnv.includes(config.admobBannerUnitId));

const manifest = read('android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /com\.google\.android\.gms\.ads\.APPLICATION_ID/);
assert.match(manifest, /android:value="@string\/admob_app_id"/);
assert(read('android/app/src/main/res/values/strings.xml').includes(`<string name="admob_app_id">${config.admobAppId}</string>`));

for (const file of ['android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle']) {
  assert(existsSync(file), `${file} is missing; run cap sync android`);
  assert(/capacitor-community-admob/.test(read(file)), `${file} does not register the AdMob plugin`);
}

const assetRoot = 'android/app/src/main/assets/public';
for (const dir of ['dist', assetRoot]) {
  assert(existsSync(dir), `${dir} is missing; run the matching build/sync first`);
  const metadata = json(`${dir}/release-metadata.json`);
  assert.equal(metadata.schemaVersion, 4);
  assert.equal(metadata.mode, requestedMode, `${dir} was built in ${metadata.mode}, expected ${requestedMode}`);
  assert.equal(metadata.advertising, true);
  assert.equal(metadata.ads.provider, 'google-admob');
  assert.equal(metadata.ads.appId, config.admobAppId);
  assert.equal(metadata.ads.bannerId, requestedMode === 'android-debug' ? GOOGLE_TEST_BANNER_ID : config.admobBannerUnitId);
  assert.equal(metadata.ads.isTesting, requestedMode === 'android-debug');
  assert.equal(metadata.ads.consent, 'google-ump');
  assert.equal(metadata.ads.maxAdContentRating, 'G');
  assert.equal(metadata.ads.tagForUnderAgeOfConsent, true);
}

const plugins = json('android/app/src/main/assets/capacitor.plugins.json');
assert(plugins.some((plugin) => /AdMobPlugin|capacitor-community\/admob/i.test(JSON.stringify(plugin))), 'Generated Capacitor plugin registry is missing AdMob');

function collectTextFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTextFiles(file, files);
    else if (/\.(?:js|json|html)$/.test(entry.name)) files.push(file);
  }
  return files;
}

const productionId = config.admobBannerUnitId;
for (const dir of ['dist', assetRoot]) {
  const bundle = collectTextFiles(dir).map(read).join('\n');
  if (requestedMode === 'production') {
    assert(bundle.includes(productionId), `${dir} does not contain the configured production banner ID`);
    assert(!bundle.includes(GOOGLE_TEST_BANNER_ID), `${dir} production bundle contains Google's test banner ID`);
    assert(!bundle.includes('VITE_UMP_DEBUG_GEOGRAPHY'), `${dir} production bundle contains UMP debug configuration`);
  } else {
    assert(bundle.includes(GOOGLE_TEST_BANNER_ID), `${dir} debug bundle does not contain Google's anchored adaptive test ID`);
    assert(!bundle.includes(productionId), `${dir} debug bundle contains the production banner ID`);
  }
}

console.log(`ADS_CHECK_OK mode=${requestedMode} admob=8.1.0 consent=UMP rating=G generated-plugin-files=current`);
