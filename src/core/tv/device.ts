import { Capacitor, registerPlugin } from "@capacitor/core";

export type TVDeviceInfo = {
  flavor: "mobile" | "tv";
  apiLevel?: number;
  searchQuery?: string;
};
export const devicePlugin = registerPlugin<{
  info(): Promise<TVDeviceInfo>;
  voiceSearch(): Promise<{ query: string }>;
  addListener(
    name: "search",
    callback: (event: { query: string }) => void
  ): Promise<{ remove(): Promise<void> }>;
}>("TatakaiDevice");
let info: TVDeviceInfo = { flavor: "mobile" };
export async function initializeTVDevice() {
  if (Capacitor.isNativePlatform()) {
    try {
      info = await devicePlugin.info();
    } catch {
      /* Older mobile APK. */
    }
  } else if (import.meta.env.DEV && import.meta.env.VITE_TV_MODE === "true") {
    info = { flavor: "tv" };
  }
  document.documentElement.classList.toggle("tatakai-tv", info.flavor === "tv");
  if (info.flavor === "tv")
    delete document.documentElement.dataset.mobileLayout;
  if (info.flavor === "tv") {
    try {
      await (await import("./secureDebrid")).initializeSecureDebrid();
    } catch {
      console.warn(
        "Device credentials could not be restored. Re-enter them in TV settings."
      );
    }
  }
  if (info.flavor === "tv" && info.searchQuery)
    history.replaceState(
      null,
      "",
      `/search?q=${encodeURIComponent(info.searchQuery)}`
    );
}
export const isTV = () => info.flavor === "tv";
export const getTVDeviceInfo = () => info;
