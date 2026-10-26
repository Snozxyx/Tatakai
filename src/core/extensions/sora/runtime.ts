import { Capacitor } from "@capacitor/core";
import { hasIosExtensionHttp } from "../mobile/iosExtensionHttp";

let prepared = false,
  failure = "";
export function localScriptRuntimeState() {
  const platform = Capacitor.getPlatform();
  const installed =
    typeof window !== "undefined" &&
    (!!(window as any).electron || Capacitor.isNativePlatform());
  const available =
    installed &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    (platform !== "ios" || hasIosExtensionHttp());
  return {
    available,
    ready: available && (platform !== "ios" || prepared),
    downloadBytes: 0,
    message: !installed
      ? "Extensions run in the installed app only."
      : platform === "ios" && !hasIosExtensionHttp()
      ? "Rebuild the iOS app to include its local extension networking bridge."
      : !available
      ? "Local workers and WebAssembly are required on this device."
      : failure ||
        (platform === "ios" && !prepared
          ? "Verify the bundled local runtime on this iPhone or iPad. Device compatibility validation is pending."
          : "Original JavaScript sources execute locally in isolated workers. Source APIs vary." +
            (platform === "ios" ? " iOS device validation is pending." : "")),
  };
}
export function recordLocalScriptRuntimeResult(error?: string) {
  prepared = !error;
  failure = error || "";
}
export const localScriptConcurrency = () =>
  Capacitor.getPlatform() === "ios" ? 2 : 4;
