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
  window.location.hash = next;
}
