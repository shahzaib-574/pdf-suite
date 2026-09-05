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

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 220);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
          onClick={() => setOpen((current) => !current)}
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
