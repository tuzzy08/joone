import { createBrowserDesktopBridge } from "./browserBridge";
import { createHttpDesktopBridge } from "./httpBridge";
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

  const httpBridgeUrl = import.meta.env.VITE_JOONE_DESKTOP_API_URL;
  if (httpBridgeUrl) {
    return createHttpDesktopBridge(httpBridgeUrl);
  }

  return createBrowserDesktopBridge();
}
