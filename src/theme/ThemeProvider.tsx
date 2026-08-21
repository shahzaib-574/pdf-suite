import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'dark' | 'light';

export type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  reducedMotion: boolean;
  setReducedMotion: (on: boolean) => void;
};

const STORAGE_KEY = 'pdf.theme';
const DARK_THEME_COLOR = '#11101b';
const LIGHT_THEME_COLOR = '#f7f6fb';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // private mode / blocked storage
  }
  return 'light';
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
    applyTheme(initial);
    return initial;
  });
  const [reducedMotion, setReducedMotionState] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  const userMotion = useRef<boolean | null>(null);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore quota / private mode
    }
  }, [theme]);

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
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const setReducedMotion = useCallback((on: boolean) => {
    userMotion.current = on;
    applyReducedMotion(on, true);
    setReducedMotionState(on);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      reducedMotion,
      setReducedMotion,
    }),
    [theme, setTheme, toggleTheme, reducedMotion, setReducedMotion],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
