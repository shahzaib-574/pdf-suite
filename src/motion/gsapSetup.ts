import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);
gsap.defaults({ duration: 0.45, ease: 'power3.out' });

export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined') {
    const flag = document.documentElement.getAttribute('data-reduced-motion');
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    if (document.documentElement.classList.contains('reduced-motion')) return true;
  }
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export { gsap, useGSAP };
