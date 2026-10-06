import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  isP2PDisabled,
  setP2PDisabled,
  P2P_POLICY_KEY,
  P2P_POLICY_CHANGED_EVENT,
} from "../src/lib/torrent/p2pPolicy";

function installStorageStub() {
  const store = new Map<string, string>();
  const dispatched: Array<{ type: string; detail?: unknown }> = [];
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as any).window = {
    dispatchEvent: (event: { type: string; detail?: unknown }) => {
      dispatched.push({ type: event.type, detail: (event as any).detail });
      return true;
    },
  };
  return { store, dispatched };
}

describe("p2p policy", () => {
  beforeEach(() => {
    installStorageStub();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).window;
  });

  test("P2P is allowed by default", () => {
    expect(isP2PDisabled()).toBe(false);
  });

  test("disabling persists and notifies", () => {
    const { store, dispatched } = installStorageStub();
    setP2PDisabled(true);
    expect(isP2PDisabled()).toBe(true);
    expect(store.get(P2P_POLICY_KEY)).toBe("true");
    expect(dispatched.some((e) => e.type === P2P_POLICY_CHANGED_EVENT)).toBe(true);

    setP2PDisabled(false);
    expect(isP2PDisabled()).toBe(false);
    expect(store.get(P2P_POLICY_KEY)).toBe("false");
  });

  test("survives missing storage without throwing", () => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).window;
    expect(isP2PDisabled()).toBe(false);
    expect(() => setP2PDisabled(true)).not.toThrow();
  });
});
