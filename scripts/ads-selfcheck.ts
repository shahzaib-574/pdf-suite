import assert from 'node:assert/strict';
import {
  GOOGLE_ANDROID_TEST_BANNER_ID,
  parseDebugTestDeviceIds,
  shouldShowDiscoveryBanner,
} from '../src/ads/policy.ts';

assert.match(GOOGLE_ANDROID_TEST_BANNER_ID, /^ca-app-pub-3940256099942544\/9214589741$/);
assert.deepEqual(parseDebugTestDeviceIds(' A, B, A, ,C '), ['A', 'B', 'C']);
assert.deepEqual(parseDebugTestDeviceIds(undefined), []);
assert.equal(shouldShowDiscoveryBanner({ name: 'home' }, false), true);
assert.equal(shouldShowDiscoveryBanner({ name: 'recents' }, false), true);
assert.equal(shouldShowDiscoveryBanner({ name: 'home' }, true), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'recents' }, true), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'settings' }, false), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'viewer' }, false), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'result' }, false), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'tool', id: 'merge' }, false), false);
assert.equal(shouldShowDiscoveryBanner({ name: 'tool', id: 'scan' }, false), false);

console.log('ADS_SELFCHECK_OK modes ids consent-route-policy incoming-overlay');
