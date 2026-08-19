import { useSyncExternalStore } from 'react';

const KEY = 'pdf.pro';
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

try {
  if (localStorage.getItem(KEY) === null) {
    localStorage.setItem(KEY, '1');
  }
} catch {
  // private mode / blocked storage
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) emit();
  });
}

export function getPro(): boolean {
  try {
    const value = localStorage.getItem(KEY);
    if (value === null) return true;
    return value === '1';
  } catch {
    return true;
  }
}

export function setPro(value: boolean): void {
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePro(): boolean {
  return useSyncExternalStore(subscribe, getPro, () => true);
}
