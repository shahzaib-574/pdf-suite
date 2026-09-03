import { Camera, Clock3, FileOutput, House, Settings } from 'lucide-react';
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
        icon={House}
        onClick={() => navigate('#/')}
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
          <Camera size={21} strokeWidth={2.2} />
        </span>
        <span>Scan</span>
      </button>
      <NavButton
        id="word"
        label="Word"
        ariaLabel="PDF to Word"
        activeTab={activeTab}
        icon={FileOutput}
        onClick={() => navigate('#/tool/pdf-docx')}
      />
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
  icon: typeof House;
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
