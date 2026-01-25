export type AppPlatform = "web" | "windows" | "macos" | "linux" | "ios" | "android";

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && (window.__TAURI__ != null || window.__TAURI_INTERNALS__ != null);
}

export function detectPlatform(): AppPlatform {
  if (!isTauri()) return "web";

  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();

  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";

  return "web";
}

export const platform: AppPlatform = detectPlatform();

export const capabilities = {
  isNative: isTauri(),
  platform,
  network: true,
  filesystem: isTauri(),
  notifications: true,
  deepLinking: isTauri(),
  secureStorage: isTauri(),
};
