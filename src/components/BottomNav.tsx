import type { ChangeEvent } from 'react';
import { Camera, Clock3, FileOutput, House, Settings } from 'lucide-react';
import { fileListToPicked } from '../store/files';
import { stagePendingScan, stagePendingScanError } from '../store/pendingScan';

export type BottomNavTab = 'tools' | 'camera' | 'extract' | 'recents' | 'settings';

export type BottomNavProps = {
  activeTab?: BottomNavTab;
};

export function BottomNav({ activeTab }: BottomNavProps) {
  async function onCameraPick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) return;
    try {
      const picked = await fileListToPicked(files, true);
      stagePendingScan(picked);
    } catch (error) {
      stagePendingScanError(
        error instanceof Error ? error.message : 'Could not read the camera image',
      );
    } finally {
      input.value = '';
      window.location.hash = '#/tool/scan';
    }
  }

  return (
    <nav className="shell__nav" aria-label="Primary navigation">
      <NavButton
        id="tools"
        label="Tools"
        activeTab={activeTab}
        icon={House}
        onClick={() => {
          window.location.hash = '#/';
        }}
      />
      <label
        className={
          activeTab === 'camera'
            ? 'shell__nav-item shell__nav-camera is-active'
            : 'shell__nav-item shell__nav-camera'
        }
        aria-current={activeTab === 'camera' ? 'page' : undefined}
      >
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Scan with camera"
          onChange={(event) => {
            void onCameraPick(event);
          }}
        />
        <span className="shell__nav-camera-icon" aria-hidden="true">
          <Camera size={21} strokeWidth={2.2} />
        </span>
        <span>Camera</span>
      </label>
      <NavButton
        id="extract"
        label="Extract"
        ariaLabel="Extract PDF to Word"
        activeTab={activeTab}
        icon={FileOutput}
        onClick={() => {
          window.location.hash = '#/tool/pdf-docx';
        }}
      />
      <NavButton
        id="recents"
        label="Recents"
        activeTab={activeTab}
        icon={Clock3}
        onClick={() => {
          window.location.hash = '#/recents';
        }}
      />
      <NavButton
        id="settings"
        label="Settings"
        activeTab={activeTab}
        icon={Settings}
        onClick={() => {
          window.location.hash = '#/settings';
        }}
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
