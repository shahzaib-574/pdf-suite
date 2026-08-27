import {
  useMemo,
  useRef,
  type PointerEvent,
  type PointerEventHandler,
  type RefObject,
} from 'react';
import { gsap, prefersReducedMotion, useGSAP } from './gsapSetup';

export function pressIn(el: Element): void {
  gsap.to(el, {
    scale: 0.98,
    duration: prefersReducedMotion() ? 0 : 0.12,
    ease: 'power2.out',
    overwrite: 'auto',
  });
}

export function pressOut(el: Element): void {
  const reduced = prefersReducedMotion();
  gsap.to(el, {
    scale: 1,
    duration: reduced ? 0 : 0.22,
    ease: 'power3.out',
    overwrite: 'auto',
  });
}

export function usePress<T extends HTMLElement>(enabled = true): {
  ref: RefObject<T | null>;
  bind: {
    onPointerDown: PointerEventHandler<T>;
    onPointerUp: PointerEventHandler<T>;
    onPointerLeave: PointerEventHandler<T>;
    onPointerCancel: PointerEventHandler<T>;
  };
} {
  const ref = useRef<T>(null);
  const { contextSafe } = useGSAP({ scope: ref });

  const bind = useMemo(() => {
    const run = (fn: (el: Element) => void): PointerEventHandler<T> =>
      contextSafe((event: PointerEvent<T>) => {
        if (!enabled || event.button > 0) return;
        fn(event.currentTarget);
      });

    return {
      onPointerDown: run(pressIn),
      onPointerUp: run(pressOut),
      onPointerLeave: run(pressOut),
      onPointerCancel: run(pressOut),
    };
  }, [contextSafe, enabled]);

  return { ref, bind };
}
