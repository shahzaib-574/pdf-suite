import type { LucideIcon } from 'lucide-react';
import { Camera, Clock3, FilePenLine, LayoutGrid, Settings } from 'lucide-react';
import { navigate } from '../screens/nav';

export type BottomNavTab = 'tools' | 'scan' | 'word' | 'recents' | 'settings';

export type BottomNavProps = {
  activeTab?: BottomNavTab;
};

export function BottomNav({ activeTab }: BottomNavProps) {
  return (
    <nav id="primary-navigation" className="shell__nav" aria-label="Primary navigation">
      <NavButton
        id="tools"
        label="Tools"
        activeTab={activeTab}
        icon={LayoutGrid}
        onClick={() => navigate('#/')}
      />
      <NavButton
        id="word"
        label="Word"
        ariaLabel="PDF to Word"
        activeTab={activeTab}
        icon={FilePenLine}
        onClick={() => navigate('#/tool/pdf-docx')}
      />
      <button
        type="button"
        className={
          activeTab === 'scan'
            ? 'shell__nav-item shell__nav-camera is-active'
            : 'shell__nav-item shell__nav-camera'
        }
        aria-current={activeTab === 'scan' ? 'page' : undefined}
        aria-label="Scan to PDF"
        onClick={() => navigate('#/tool/scan')}
      >
        <span className="shell__nav-camera-icon" aria-hidden="true">
          <Camera size={26} strokeWidth={2.15} />
        </span>
        <span>Scan</span>
      </button>
      <NavButton
        id="recents"
        label="Recents"
        activeTab={activeTab}
        icon={Clock3}
        onClick={() => navigate('#/recents')}
      />
      <NavButton
        id="settings"
        label="Settings"
        activeTab={activeTab}
        icon={Settings}
        onClick={() => navigate('#/settings')}
      />
    </nav>
  );
}

type NavButtonProps = {
  id: BottomNavTab;
  label: string;
  ariaLabel?: string;
  activeTab?: BottomNavTab;
  icon: LucideIcon;
  onClick: () => void;
};

function NavButton({
  id,
  label,
  ariaLabel,
  activeTab,
  icon: Icon,
  onClick,
}: NavButtonProps) {
  const active = activeTab === id;
  return (
    <button
      type="button"
      className={active ? 'shell__nav-item is-active' : 'shell__nav-item'}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon size={20} strokeWidth={active ? 2.35 : 1.9} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
