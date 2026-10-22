import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from "react";

type Pending = {
  index: number;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  timer: number | undefined;
};

type Drag = {
  index: number;
  pointerId: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  clientY: number;
  scroll0: number;
  slots: DOMRect[];
  target: number;
};

export type DragReorderOptions = {
  /** Stable keys in their current display order. */
  keys: string[];
  enabled: boolean;
  nodes: MutableRefObject<Map<string, HTMLElement>>;
  /** Element whose touch scrolling is blocked while a drag is active. */
  container: RefObject<HTMLElement | null>;
  /** Optional scrolling box that auto-scrolls when dragging near its edges. */
  scroller?: RefObject<HTMLElement | null>;
  /** Pointer-downs inside matching elements never start a drag or tap. */
  ignore?: string;
  onMove: (from: number, to: number) => void;
  /** Called for a press that did not become a drag. */
  onTap?: (index: number) => void;
};

const LONG_PRESS_MS = 280;
const MOVE_SLOP = 8;
const EDGE = 56;

export function movedOrder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Pointer-driven reordering for a grid of cards: touch needs a long-press
 * (so swipes still scroll), mouse drags after a few pixels. Cards keep their
 * DOM order during the drag and slide into place with transforms.
 */
export function useDragReorder(options: DragReorderOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const pending = useRef<Pending | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!settling) return;
    const id = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(id);
  }, [settling]);

  // Touch scrolling is only blocked once a long-press has turned into a drag.
  useEffect(() => {
    const node = options.container.current;
    if (!node) return;
    const block = (event: TouchEvent) => {
      if (dragRef.current) event.preventDefault();
    };
    node.addEventListener("touchmove", block, { passive: false });
    return () => node.removeEventListener("touchmove", block);
  }, [options.container]);

  useEffect(
    () => () => {
      if (pending.current?.timer) window.clearTimeout(pending.current.timer);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  function scrollTop(): number {
    return latest.current.scroller?.current?.scrollTop ?? 0;
  }

  function nearest(current: Drag, dx: number, dy: number): number {
    const own = current.slots[current.index]!;
    const cx = own.left + own.width / 2 + dx;
    const cy = own.top + own.height / 2 + dy;
    let best = current.index;
    let bestDistance = Number.POSITIVE_INFINITY;
    current.slots.forEach((slot, index) => {
      const distance = Math.hypot(
        slot.left + slot.width / 2 - cx,
        slot.top + slot.height / 2 - cy,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function update(current: Drag, clientX: number, clientY: number): void {
    const dx = clientX - current.x;
    const dy = clientY - current.y + (scrollTop() - current.scroll0);
    const next = { ...current, dx, dy, clientY, target: nearest(current, dx, dy) };
    dragRef.current = next;
    setDrag(next);
  }

  function autoScroll(): void {
    const current = dragRef.current;
    const box = latest.current.scroller?.current;
    if (!current || !box) return;
    const rect = box.getBoundingClientRect();
    const speed =
      current.clientY < rect.top + EDGE
        ? -Math.ceil((rect.top + EDGE - current.clientY) / 4)
        : current.clientY > rect.bottom - EDGE
          ? Math.ceil((current.clientY - (rect.bottom - EDGE)) / 4)
          : 0;
    if (speed) {
      const before = box.scrollTop;
      box.scrollBy(0, speed);
      if (box.scrollTop !== before) {
        update(current, current.x + current.dx, current.clientY);
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function start(state: Pending): Drag {
    const { keys, nodes } = latest.current;
    const next: Drag = {
      index: state.index,
      pointerId: state.pointerId,
      x: state.x,
      y: state.y,
      dx: 0,
      dy: 0,
      clientY: state.y,
      scroll0: scrollTop(),
      slots: keys.map(
        (key) => nodes.current.get(key)?.getBoundingClientRect() ?? new DOMRect(),
      ),
      target: state.index,
    };
    pending.current = null;
    dragRef.current = next;
    setDrag(next);
    try {
      nodes.current.get(keys[state.index]!)?.setPointerCapture(state.pointerId);
    } catch {
      // The pointer may already be gone; the drag still ends on pointerup.
    }
    if (state.pointerType !== "mouse") navigator.vibrate?.(12);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(autoScroll);
    return next;
  }

  function end(pointerId: number, commit: boolean): "drag" | "press" | null {
    const waiting = pending.current;
    if (waiting && waiting.pointerId === pointerId) {
      window.clearTimeout(waiting.timer);
      pending.current = null;
      return commit ? "press" : null;
    }
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return null;
    dragRef.current = null;
    cancelAnimationFrame(frame.current);
    setDrag(null);
    setSettling(true);
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (commit && current.target !== current.index) {
      latest.current.onMove(current.index, current.target);
    }
    return "drag";
  }

  function bind(index: number) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const { ignore, enabled } = latest.current;
        if (ignore && (event.target as Element).closest(ignore)) return;
        const state: Pending = {
          index,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          timer: undefined,
        };
        if (enabled && event.pointerType !== "mouse") {
          state.timer = window.setTimeout(() => {
            if (pending.current === state) start(state);
          }, LONG_PRESS_MS);
        }
        pending.current = state;
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const waiting = pending.current;
        let current = dragRef.current;
        if (waiting && waiting.pointerId === event.pointerId) {
          const distance = Math.hypot(
            event.clientX - waiting.x,
            event.clientY - waiting.y,
          );
          if (distance < MOVE_SLOP) return;
          if (!latest.current.enabled || waiting.pointerType !== "mouse") {
            // Moving before the long-press fires is a scroll, not a drag.
            window.clearTimeout(waiting.timer);
            pending.current = null;
            return;
          }
          current = start(waiting);
        }
        if (!current || current.pointerId !== event.pointerId) return;
        update(current, event.clientX, event.clientY);
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (end(event.pointerId, true) === "press") latest.current.onTap?.(index);
      },
      onPointerCancel(event: PointerEvent<HTMLElement>) {
        end(event.pointerId, false);
      },
      onContextMenu(event: MouseEvent<HTMLElement>) {
        if (latest.current.enabled) event.preventDefault();
      },
    };
  }

  function style(index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    if (index === drag.index) {
      return {
        transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.04)`,
      };
    }
    const position = movedOrder(
      drag.slots.map((_, i) => i),
      drag.index,
      drag.target,
    ).indexOf(index);
    if (position === index) return undefined;
    const from = drag.slots[index]!;
    const to = drag.slots[position]!;
    return {
      transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0)`,
    };
  }

  return {
    dragIndex: drag?.index ?? null,
    dragging: drag !== null,
    settling,
    bind,
    style,
    /** True right after a drag ends, so the card's click can be ignored. */
    clickSuppressed: () => suppressClick.current,
  };
}
