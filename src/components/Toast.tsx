import { useEffect, useState } from "react";

/**
 * A brief system-style notice near the bottom of the screen, like an Android
 * toast. Call showToast() from anywhere; <ToastHost /> (mounted once in App)
 * shows the latest message and fades it out on its own.
 */

const VISIBLE_MS = 2500;

type ToastMessage = { id: number; text: string };

let nextId = 0;
const listeners = new Set<(message: ToastMessage) => void>();

export function showToast(text: string): void {
  const message = { id: ++nextId, text };
  listeners.forEach((listener) => listener(message));
}

export function ToastHost() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const listener = (next: ToastMessage) => {
      setLeaving(false);
      setMessage(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const fade = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    const clear = window.setTimeout(() => setMessage(null), VISIBLE_MS + 220);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(clear);
    };
  }, [message]);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {message ? (
        // Keyed so a repeated tap restarts the entrance and the timer.
        <p key={message.id} className={leaving ? "toast is-leaving" : "toast"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
