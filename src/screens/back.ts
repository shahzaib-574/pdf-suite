import { useEffect, useRef } from "react";
import { navigate, parseHash } from "./nav";

export type BackHandler = () => boolean;

const OVERLAY_KEY = "reamOverlay";

const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function handleAppBack(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]!()) return true;
  }
  const depth = Number(window.history.state?.reamDepth ?? 0);
  if (depth > 0) {
    window.history.back();
    return true;
  }
  if (parseHash(window.location.hash).name !== "home") {
    navigate("#/");
    return true;
  }
  return false;
}

declare global {
  interface Window {
    __reamHandleBack?: () => boolean;
  }
}

export function installAppBack(): () => void {
  window.__reamHandleBack = handleAppBack;
  const onReamBack = () => {
    handleAppBack();
  };
  window.addEventListener("reamback", onReamBack);
  return () => {
    window.removeEventListener("reamback", onReamBack);
    if (window.__reamHandleBack === handleAppBack) {
      delete window.__reamHandleBack;
    }
  };
}

export function dismissOverlayOr(fallback: () => void): void {
  if (window.history.state?.[OVERLAY_KEY]) {
    window.history.back();
    return;
  }
  fallback();
}

export function useOverlayBack(onBack: () => void): void {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    const snapshot = {
      state: window.history.state as object | null,
      url: window.location.href,
    };
    const depth = Number(
      snapshot.state && "reamDepth" in snapshot.state
        ? (snapshot.state as { reamDepth?: number }).reamDepth
        : 0,
    );
    window.history.pushState(
      {
        ...(snapshot.state ?? {}),
        reamDepth: depth + 1,
        [OVERLAY_KEY]: true,
      },
      "",
      snapshot.url,
    );

    let dismissed = false;
    const onPop = () => {
      if (dismissed) return;
      dismissed = true;
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (dismissed) return;
      dismissed = true;
      if (window.history.state?.[OVERLAY_KEY]) {
        window.history.replaceState(snapshot.state, "", snapshot.url);
      }
    };
  }, []);
}

export function useBackHandler(handler: BackHandler): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => registerBackHandler(() => handlerRef.current()), []);
}
