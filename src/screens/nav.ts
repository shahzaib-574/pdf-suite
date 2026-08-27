import { toolById } from '../lib/catalog';
import type { Route, ToolId } from '../lib/types';

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = (q === -1 ? raw : raw.slice(0, q)) || '/';
  const query = q === -1 ? '' : raw.slice(q + 1);
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'home' };

  const [head, rest] = parts;
  if (head === 'recents') return { name: 'recents' };
  if (head === 'settings') return { name: 'settings' };
  if (head === 'result') return { name: 'result' };
  if (head === 'viewer') {
    const id = params.get('id');
    return { name: 'viewer', recentId: id ? id : undefined };
  }
  if (head === 'tool' && rest && toolById(rest)) {
    return { name: 'tool', id: rest as ToolId };
  }
  return { name: 'home' };
}

export function navigate(hash: string): void {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  const currentDepth = Number(window.history.state?.reamDepth ?? 0);
  window.history.pushState(
    { ...window.history.state, reamDepth: currentDepth + 1 },
    '',
    next,
  );
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function goBack(fallback = '#/'): void {
  const currentDepth = Number(window.history.state?.reamDepth ?? 0);
  if (currentDepth > 0) {
    window.history.back();
    return;
  }
  navigate(fallback);
}
