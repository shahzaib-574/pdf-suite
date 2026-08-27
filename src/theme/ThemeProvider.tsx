import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { ThemeContext, type Theme } from './context';

const STORAGE_KEY = 'pdf.theme';
const MOTION_STORAGE_KEY = 'pdf.reducedMotion';
const DARK_THEME_COLOR = '#13141d';
const LIGHT_THEME_COLOR = '#eef1f7';

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // private mode / blocked storage
  }
  return 'system';
}

function readSystemTheme(): Exclude<Theme, 'system'> {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredMotion(): boolean | null {
  try {
    const raw = localStorage.getItem(MOTION_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      theme === 'light' ? LIGHT_THEME_COLOR : DARK_THEME_COLOR,
    );
  }
}

function applyReducedMotion(on: boolean, userSet: boolean): void {
  const root = document.documentElement;
  root.classList.toggle('reduced-motion', on);
  if (userSet) {
    root.setAttribute('data-reduced-motion', on ? 'true' : 'false');
    return;
  }
  if (on) root.setAttribute('data-reduced-motion', 'true');
  else root.removeAttribute('data-reduced-motion');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readStoredTheme();
    applyTheme(initial === 'system' ? readSystemTheme() : initial);
    return initial;
  });
  const [systemTheme, setSystemTheme] = useState<Exclude<Theme, 'system'>>(
    readSystemTheme,
  );
  const [storedMotion] = useState<boolean | null>(readStoredMotion);
  const userMotion = useRef<boolean | null>(storedMotion);
  const [reducedMotion, setReducedMotionState] = useState(() =>
    storedMotion ??
      (typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false),
  );

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
    if (Capacitor.isNativePlatform()) {
      void SystemBars.setStyle({
        style:
          resolvedTheme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch(() => undefined);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore quota / private mode
    }
  }, [resolvedTheme, theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const on = userMotion.current ?? mq.matches;
      applyReducedMotion(on, userMotion.current !== null);
      setReducedMotionState(on);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  const setReducedMotion = useCallback((on: boolean) => {
    userMotion.current = on;
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, String(on));
    } catch {
      // ignore quota / private mode
    }
    applyReducedMotion(on, true);
    setReducedMotionState(on);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      reducedMotion,
      setReducedMotion,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme, reducedMotion, setReducedMotion],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
