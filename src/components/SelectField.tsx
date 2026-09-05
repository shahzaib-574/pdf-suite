import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type SelectFieldOption = {
  value: string;
  label: string;
};

export type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectFieldOption[];
  disabled?: boolean;
  grow?: boolean;
  onChange: (value: string) => void;
};

const MENU_MAX_HEIGHT = 240;
const MENU_CHROME = 12;
const MENU_ITEM = 44;
const MENU_GAP = 4;

function menuDropsUp(anchor: HTMLElement, itemCount: number): boolean {
  const rect = anchor.getBoundingClientRect();
  const menu = Math.min(itemCount * MENU_ITEM + MENU_CHROME, MENU_MAX_HEIGHT);
  const needed = menu + MENU_GAP;
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  if (below >= needed) return false;
  return above > below;
}

export function SelectField({
  label,
  value,
  options,
  disabled = false,
  grow = false,
  onChange,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  function placeMenu(): void {
    const root = rootRef.current;
    if (!root) return;
    const next = menuDropsUp(root, options.length);
    setDropUp((current) => (current === next ? current : next));
  }

  function toggle(): void {
    if (open) {
      setOpen(false);
      return;
    }
    placeMenu();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const count = options.length;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onResize() {
      if (!root) return;
      const next = menuDropsUp(root, count);
      setDropUp((current) => (current === next ? current : next));
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [open, options.length]);

  return (
    <div className={`ps-field${grow ? " ps-grow" : ""}`}>
      <span>{label}</span>
      <div ref={rootRef} className={`ps-select${open ? " is-open" : ""}`}>
        <button
          type="button"
          className="ps-select__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          disabled={disabled}
          onClick={toggle}
        >
          <span>{selected?.label ?? ""}</span>
          <ChevronDown size={18} strokeWidth={2.1} aria-hidden="true" />
        </button>
        {open ? (
          <ul
            id={listId}
            className={`ps-select__menu${dropUp ? " is-up" : ""}`}
            role="listbox"
            aria-label={label}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`ps-select__option${active ? " is-selected" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
