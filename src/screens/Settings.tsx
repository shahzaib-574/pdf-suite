import { useState } from 'react';
import { Check, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { AnimatedButton, AppShell } from '../components';
import { clearRecents } from '../store/recents';
import { useTheme } from '../theme/ThemeProvider';

export function Settings() {
  const { theme, setTheme, reducedMotion, setReducedMotion } = useTheme();
  const [cleared, setCleared] = useState(false);

  return (
    <AppShell>
      <section className="ps-settings">
        <div className="ps-page-intro">
          <p className="ps-eyebrow">Make it yours</p>
          <h1>Settings</h1>
          <p>Adjust appearance and how the app feels.</p>
        </div>

        <section className="ps-settings-group" aria-labelledby="appearance-title">
          <h2 id="appearance-title">Appearance</h2>
          <div className="ps-settings-card">
            <div className="ps-setting-copy">
              <strong>Theme</strong>
              <span>Choose the look that feels best.</span>
            </div>
            <div className="ps-segmented" aria-label="Theme">
              <button
                type="button"
                className={theme === 'light' ? 'is-active' : ''}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                <Sun size={16} aria-hidden="true" /> Light
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'is-active' : ''}
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                <Moon size={16} aria-hidden="true" /> Dark
              </button>
            </div>
            <label className="ps-switch ps-switch--card">
              <span className="ps-setting-copy">
                <strong>Reduce motion</strong>
                <span>Minimize transitions and animated feedback.</span>
              </span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
            </label>
          </div>
        </section>

        <section className="ps-settings-group" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Privacy & storage</h2>
          <div className="ps-settings-card">
            <div className="ps-privacy-row">
              <span className="ps-setting-icon" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <span className="ps-setting-copy">
                <strong>On-device by design</strong>
                <span>No account. Files are processed locally and are never uploaded.</span>
              </span>
            </div>
            <AnimatedButton
              variant="ghost"
              block
              icon={Trash2}
              onClick={() => {
                void clearRecents().then(() => setCleared(true));
              }}
            >
              Clear recent files
            </AnimatedButton>
            {cleared ? (
              <p className="ps-success-note" role="status">
                <Check size={15} aria-hidden="true" /> Recent files cleared
              </p>
            ) : null}
          </div>
        </section>

        <p className="ps-app-version">Ream · Private PDF tools</p>
      </section>
    </AppShell>
  );
}
