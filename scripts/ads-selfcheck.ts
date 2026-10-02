import assert from 'node:assert/strict';
import {
  GOOGLE_ANDROID_TEST_BANNER_ID,
  parseDebugTestDeviceIds,
  shouldShowToolsBanner,
} from '../src/ads/policy.ts';

assert.match(GOOGLE_ANDROID_TEST_BANNER_ID, /^ca-app-pub-3940256099942544\/9214589741$/);
assert.deepEqual(parseDebugTestDeviceIds(' A, B, A, ,C '), ['A', 'B', 'C']);
assert.deepEqual(parseDebugTestDeviceIds(undefined), []);
assert.equal(shouldShowToolsBanner({ name: 'home' }, false, false), true);
assert.equal(shouldShowToolsBanner({ name: 'recents' }, false, false), false);
assert.equal(shouldShowToolsBanner({ name: 'home' }, true, false), false);
assert.equal(shouldShowToolsBanner({ name: 'recents' }, true, false), false);
assert.equal(shouldShowToolsBanner({ name: 'settings' }, false, false), false);
assert.equal(shouldShowToolsBanner({ name: 'viewer' }, false, false), false);
assert.equal(shouldShowToolsBanner({ name: 'result' }, false, false), false);
assert.equal(shouldShowToolsBanner({ name: 'tool', id: 'merge' }, false, false), false);
assert.equal(shouldShowToolsBanner({ name: 'tool', id: 'scan' }, false, false), false);

console.log('ADS_SELFCHECK_OK modes ids consent-route-policy incoming-overlay');

assert.equal(shouldShowToolsBanner({ name: 'home' }, false, true), false);
