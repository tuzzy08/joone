import { createBrowserDesktopBridge } from "./browserBridge";
import { createTauriDesktopBridge } from "./tauriBridge";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function getDesktopBridge() {
  if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
    return createTauriDesktopBridge();
  }

  return createBrowserDesktopBridge();
}
