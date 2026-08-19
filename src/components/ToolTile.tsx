import type { LucideIcon } from 'lucide-react';
import '../motion/gsapSetup';
import { usePress } from '../motion/press';

export type ToolTileProps = {
  title: string;
  blurb: string;
  icon: LucideIcon;
  pro?: boolean;
  onSelect: () => void;
  index?: number;
};

/** Wrap tiles in StaggerGrid for home enter stagger. */
export function ToolTile({
  title,
  blurb,
  icon: Icon,
  pro = false,
  onSelect,
  index,
}: ToolTileProps) {
  const { ref, bind } = usePress<HTMLButtonElement>();

  return (
    <button
      ref={ref}
      type="button"
      className="tile"
      data-tile=""
      data-index={index}
      onClick={onSelect}
      {...bind}
    >
      <span className="tile__top">
        <span className="tile__icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.1} />
        </span>
        {pro ? <span className="tile__pro">Pro</span> : null}
      </span>
      <span className="tile__title">{title}</span>
      <span className="tile__blurb">{blurb}</span>
    </button>
  );
}
