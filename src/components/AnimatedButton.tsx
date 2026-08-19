import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import '../motion/gsapSetup';
import { usePress } from '../motion/press';

export type AnimatedButtonVariant = 'primary' | 'ghost' | 'danger' | 'brass';

export type AnimatedButtonProps = {
  children?: ReactNode;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  variant?: AnimatedButtonVariant;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: LucideIcon;
  block?: boolean;
  className?: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'type' | 'disabled' | 'children' | 'className'
>;

export function AnimatedButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  icon: Icon,
  block = false,
  className,
  ...rest
}: AnimatedButtonProps) {
  const { ref, bind } = usePress<HTMLButtonElement>(!disabled);
  const classes = [
    'btn',
    `btn--${variant}`,
    block ? 'btn--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...rest}
      {...bind}
    >
      {Icon ? <Icon size={18} strokeWidth={2.1} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
