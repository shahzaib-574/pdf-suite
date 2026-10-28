import { useSyncExternalStore } from 'react';

export const isWebsite = import.meta.env.VITE_REAM_WEBSITE === 'true';

// On phone widths the website is the app: same home, bottom nav, theme and
// screens. Tablets and desktops get the web header, home, footer and theme.
const APP_LAYOUT_QUERY = '(max-width: 767px)';

function appLayoutQuery(): MediaQueryList | null {
  return typeof window === 'undefined' ? null : window.matchMedia(APP_LAYOUT_QUERY);
}

/** True when the website should show its wide web layout right now. */
export function usesWebLayout(): boolean {
  return isWebsite && !appLayoutQuery()?.matches;
}

function subscribe(onChange: () => void): () => void {
  const query = appLayoutQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** usesWebLayout(), re-rendering when the window crosses the phone width. */
export function useWebLayout(): boolean {
  return useSyncExternalStore(subscribe, usesWebLayout, () => isWebsite);
}

/**
 * Keeps <html data-website> (which switches on the web theme and layout CSS)
 * in step with the window width, so a phone-width website styles as the app.
 */
export function syncWebLayoutAttribute(): void {
  if (!isWebsite) return;
  const apply = () => {
    if (usesWebLayout()) document.documentElement.dataset.website = 'true';
    else delete document.documentElement.dataset.website;
  };
  apply();
  subscribe(apply);
}
