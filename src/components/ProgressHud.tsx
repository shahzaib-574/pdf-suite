import { useRef } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from '../motion/gsapSetup';

export type ProgressHudProps = {
  open: boolean;
  label: string;
  progress?: number;
};

export function ProgressHud({ open, label, progress }: ProgressHudProps) {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const determinate = progress != null;

  useGSAP(
    () => {
      const overlay = root.current;
      if (!overlay) return;
      const reduced = prefersReducedMotion();
      gsap.to(overlay, {
        autoAlpha: open ? 1 : 0,
        duration: reduced ? 0 : 0.3,
        overwrite: true,
      });
      if (fill.current) {
        if (progress != null) {
          const clamped = Math.min(1, Math.max(0, progress));
          gsap.to(fill.current, {
            scaleX: clamped,
            duration: reduced ? 0 : 0.3,
            ease: 'power3.out',
            overwrite: true,
          });
        } else {
          gsap.set(fill.current, { clearProps: 'transform' });
        }
      }
    },
    { scope: root, dependencies: [open, progress] },
  );

  return (
    <div
      ref={root}
      className={open ? 'hud is-open' : 'hud'}
      role="status"
      aria-live="polite"
      aria-busy={open}
      aria-hidden={!open}
    >
      <div className="hud__card">
        <p className="hud__label">{label}</p>
        <div
          className="hud__track"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            determinate ? Math.round((progress ?? 0) * 100) : undefined
          }
        >
          <div
            ref={fill}
            className={
              determinate ? 'hud__fill' : 'hud__fill hud__fill--indeterminate'
            }
          />
        </div>
        {determinate ? (
          <p className="hud__pct tabular">{Math.round((progress ?? 0) * 100)}%</p>
        ) : null}
      </div>
    </div>
  );
}
