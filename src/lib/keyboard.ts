/**
 * Android resizes the WebView when the on-screen keyboard opens, which lifts
 * the fixed bottom nav up above the keyboard. Mark <html> with
 * `is-keyboard-open` while a text field has focus and the viewport has shrunk
 * by keyboard height, so CSS can hide the nav until the keyboard closes.
 */

// Smaller shrinks are browser toolbars or IME suggestion strips, not a keyboard.
const KEYBOARD_MIN_PX = 150;

function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement)
    return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(element.type);
}

export function watchKeyboard(): void {
  const root = document.documentElement;
  // Tallest height seen at each width, so rotation keeps its own baseline.
  const fullHeight = new Map<number, number>();

  const update = () => {
    const width = window.innerWidth;
    const height = Math.min(
      window.innerHeight,
      window.visualViewport?.height ?? window.innerHeight,
    );
    const baseline = Math.max(fullHeight.get(width) ?? 0, height);
    fullHeight.set(width, baseline);
    const open =
      isTextEntry(document.activeElement) &&
      baseline - height > KEYBOARD_MIN_PX;
    root.classList.toggle("is-keyboard-open", open);
  };

  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  // Focus changes alone don't resize anything; a blur with the keyboard
  // already gone must clear the flag, and focus may land after the resize.
  document.addEventListener("focusin", () => requestAnimationFrame(update));
  document.addEventListener("focusout", () => requestAnimationFrame(update));
  update();
}
