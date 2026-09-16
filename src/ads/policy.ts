import type { Route } from '../lib/types';

export const GOOGLE_ANDROID_TEST_BANNER_ID =
  'ca-app-pub-3940256099942544/9214589741';

export function isDiscoveryRoute(route: Route): boolean {
  return route.name === 'home' || route.name === 'recents';
}

export function shouldShowDiscoveryBanner(
  route: Route,
  hasIncomingFileChoice: boolean,
): boolean {
  return isDiscoveryRoute(route) && !hasIncomingFileChoice;
}

export function parseDebugTestDeviceIds(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))];
}
