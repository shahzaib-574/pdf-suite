import { ChevronLeft } from 'lucide-react';
import { AnimatedButton } from './AnimatedButton';

export type PageHeaderProps = {
  title?: string;
  onBack?: () => void;
  backLabel?: string;
  subtitle?: string;
};

export function PageHeader({ title, onBack, backLabel = "Back", subtitle }: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack ? (
        <AnimatedButton
          variant="ghost"
          className="btn--icon"
          icon={ChevronLeft}
          aria-label={backLabel}
          onClick={onBack}
        />
      ) : null}
      {title || subtitle ? (
        <div className="page-header__copy">
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p dir="auto">{subtitle}</p> : null}
        </div>
      ) : null}
    </header>
  );
}
