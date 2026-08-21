import { useRef, type ReactNode } from 'react';
import { gsap, prefersReducedMotion, useGSAP } from '../motion/gsapSetup';

export type StaggerGridProps = {
  children: ReactNode;
  className?: string;
};

export function StaggerGrid({ children, className }: StaggerGridProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set('[data-tile]', { y: 0, autoAlpha: 1 });
        return;
      }
      gsap.from('[data-tile]', {
        y: 10,
        autoAlpha: 0,
        stagger: 0.035,
        duration: 0.36,
        ease: 'power3.out',
      });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className={['stagger-grid', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
