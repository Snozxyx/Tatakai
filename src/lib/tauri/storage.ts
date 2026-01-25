import { isTauri } from "@/lib/platform";
import type { Store } from "@tauri-apps/plugin-store";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const STORE_FILENAME = "tatakai.store.json";

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = import("@tauri-apps/plugin-store").then((mod) => new mod.Store(STORE_FILENAME));
  }
  return storePromise;
}

export async function getItem<T extends JsonValue = JsonValue>(key: string): Promise<T | null> {
  if (!isTauri()) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  const store = await getStore();
  const value = await store.get(key);
  return (value as T | null) ?? null;
}

export async function setItem(key: string, value: JsonValue): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  const store = await getStore();
  await store.set(key, value);
  await store.save();
}

export async function removeItem(key: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(key);
    return;
  }

  const store = await getStore();
  await store.delete(key);
  await store.save();
}

export async function clear(): Promise<void> {
  if (!isTauri()) {
    localStorage.clear();
    return;
  }

  const store = await getStore();
  await store.clear();
  await store.save();
}
