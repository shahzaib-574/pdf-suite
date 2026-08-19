import { useState } from 'react';
import { AnimatedButton, PageHeader } from '../components';
import { setPro, usePro } from '../store/entitlements';
import { clearRecents } from '../store/recents';
import { useTheme } from '../theme/ThemeProvider';
import { navigate } from './nav';

export function Settings() {
  const pro = usePro();
  const { theme, setTheme, reducedMotion, setReducedMotion } = useTheme();
  const [cleared, setCleared] = useState(false);

  return (
    <div className="ps-screen">
      <PageHeader title="Settings" onBack={() => navigate('#/')} />
      <div className="ps-body">
        <label className="ps-switch">
          <span>Dark theme</span>
          <input
            type="checkbox"
            checked={theme === 'dark'}
            onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')}
          />
        </label>
        <label className="ps-switch">
          <span>Pro unlocked</span>
          <input
            type="checkbox"
            checked={pro}
            onChange={(event) => setPro(event.target.checked)}
          />
        </label>
        <label className="ps-switch">
          <span>Reduce motion</span>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />
        </label>
        <AnimatedButton
          variant="ghost"
          block
          onClick={() => {
            void clearRecents().then(() => setCleared(true));
          }}
        >
          Clear recents
        </AnimatedButton>
        {cleared ? <p className="ps-note">Recents cleared.</p> : null}
        <div className="ps-copy">
          <p className="ps-muted">Files never leave this device. No account.</p>
          <p className="ps-note">Ream - PDF Suite</p>
        </div>
      </div>
    </div>
  );
}
