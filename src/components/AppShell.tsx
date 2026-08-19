import type { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { APP_SHORT_NAME, APP_TAGLINE } from '../lib/catalog';
import { AnimatedButton } from './AnimatedButton';

export type AppShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  onSettings?: () => void;
};

export function AppShell({ children, footer, onSettings }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell__bar">
        <div className="shell__brand">
          <span className="shell__mark" aria-hidden="true" />
          <div className="shell__titles">
            <p className="shell__name">{APP_SHORT_NAME}</p>
            <p className="shell__tag">{APP_TAGLINE}</p>
          </div>
        </div>
        <AnimatedButton
          variant="ghost"
          className="btn--icon"
          icon={Settings}
          aria-label="Settings"
          onClick={onSettings}
        />
      </header>
      <main className="shell__body">{children}</main>
      {footer ? <footer className="shell__footer">{footer}</footer> : null}
    </div>
  );
}
