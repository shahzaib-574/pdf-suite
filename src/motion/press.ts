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
    scale: 0.96,
    duration: prefersReducedMotion() ? 0 : 0.14,
    ease: 'power2.out',
    overwrite: 'auto',
  });
}

export function pressOut(el: Element): void {
  const reduced = prefersReducedMotion();
  gsap.to(el, {
    scale: 1,
    duration: reduced ? 0 : 0.28,
    ease: reduced ? 'power3.out' : 'back.out(1.4)',
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
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const { contextSafe } = useGSAP({ scope: ref });

  const bind = useMemo(() => {
    const run = (fn: (el: Element) => void): PointerEventHandler<T> =>
      contextSafe((event: PointerEvent<T>) => {
        if (!enabledRef.current || event.button > 0) return;
        if (ref.current) fn(ref.current);
      });

    return {
      onPointerDown: run(pressIn),
      onPointerUp: run(pressOut),
      onPointerLeave: run(pressOut),
      onPointerCancel: run(pressOut),
    };
  }, [contextSafe]);

  return { ref, bind };
}
