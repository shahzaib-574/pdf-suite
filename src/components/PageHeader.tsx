import { ChevronLeft } from 'lucide-react';
import { AnimatedButton } from './AnimatedButton';

export type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  subtitle?: string;
};

export function PageHeader({ title, onBack, subtitle }: PageHeaderProps) {
  return (
    <header className="page-header">
      {onBack ? (
        <AnimatedButton
          variant="ghost"
          className="btn--icon"
          icon={ChevronLeft}
          aria-label="Back"
          onClick={onBack}
        />
      ) : null}
      <div className="page-header__copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </header>
  );
}
