import { secretStorage } from "./secretStorage";
import { debridOrchestrator } from "@/core/providers/debrid-orchestrator";
const values = new Map<string, string>();
const accountsKey = "tatakai_debrid_accounts",
  activeKey = "tatakai_active_debrid_provider";
export async function initializeSecureDebrid() {
  for (const key of [accountsKey, activeKey]) {
    const value = (await secretStorage.get(key)) || localStorage.getItem(key);
    if (value) {
      await secretStorage.set(key, value);
      values.set(key, value);
      localStorage.removeItem(key);
    }
  }
  debridOrchestrator.useStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
      void secretStorage
        .set(key, value)
        .catch(() =>
          window.dispatchEvent(
            new CustomEvent("tatakai-tv-storage-error", {
              detail:
                "Could not save debrid credentials. Re-enter them before restarting the TV.",
            })
          )
        );
    },
  });
}
