import { Capacitor, registerPlugin } from "@capacitor/core";
const native = registerPlugin<{
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  remove(options: { key: string }): Promise<void>;
}>("TatakaiSecrets");
// Browser TV preview deliberately holds credentials only in memory.
const preview = new Map<string, string>();
export const secretStorage = {
  async set(key: string, value: string) {
    if (Capacitor.getPlatform() === "android") await native.set({ key, value });
    else preview.set(key, value);
  },
  async get(key: string) {
    return Capacitor.getPlatform() === "android"
      ? (await native.get({ key })).value
      : preview.get(key) ?? null;
  },
  async remove(key: string) {
    if (Capacitor.getPlatform() === "android") await native.remove({ key });
    else preview.delete(key);
  },
};
