import { useCallback, useEffect, useState } from "react";

/**
 * P2P kill-switch — one user preference behind every swarm join.
 *
 * When on, the app never starts a peer-to-peer torrent session: `hasTorrentService()`
 * reports no torrent capability (which hides torrent downloads and disables the
 * swarm branch of playback), and `TorrentAdapter` refuses magnet/info-hash
 * sources outright. Torrent *releases* still play when a debrid service
 * (TorBox / Real-Debrid) is configured — those resolve server-side to plain
 * HTTP and never touch a swarm.
 *
 * Device-local like the debrid tokens themselves (never synced to the account).
 */

export const P2P_POLICY_KEY = "tatakai_disable_p2p";
export const P2P_POLICY_CHANGED_EVENT = "tatakai-p2p-policy-changed";

function readStored(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(P2P_POLICY_KEY) === "true";
  } catch {
    return false;
  }
}

/** True when the user disabled peer-to-peer torrents entirely. */
export function isP2PDisabled(): boolean {
  return readStored();
}

/** Persist the preference and notify live listeners (same tab + other tabs). */
export function setP2PDisabled(disabled: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(P2P_POLICY_KEY, disabled ? "true" : "false");
    }
  } catch {
    /* storage unavailable — listeners still update for this session */
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(P2P_POLICY_CHANGED_EVENT, { detail: { disabled } }));
    }
  } catch {
    /* ignore */
  }
}

/** Reactive binding for settings UI. Syncs across tabs via `storage` events. */
export function useP2PDisabled(): [boolean, (disabled: boolean) => void] {
  const [disabled, setDisabled] = useState<boolean>(() => readStored());

  useEffect(() => {
    const sync = () => {
      const next = readStored();
      setDisabled((prev) => (prev === next ? prev : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== P2P_POLICY_KEY) return;
      sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(P2P_POLICY_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(P2P_POLICY_CHANGED_EVENT, sync);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    setP2PDisabled(next);
    setDisabled(next);
  }, []);

  return [disabled, update];
}
