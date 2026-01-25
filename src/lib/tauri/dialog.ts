import { isTauri } from "@/lib/platform";

export async function showMessage(message: string, title = "Tatakai"): Promise<void> {
  if (!isTauri()) {
    window.alert(message);
    return;
  }

  const { message: tauriMessage } = await import("@tauri-apps/plugin-dialog");
  await tauriMessage(message, { title, kind: "info" });
}

export async function confirmDialog(message: string, title = "Tatakai"): Promise<boolean> {
  if (!isTauri()) {
    return window.confirm(message);
  }

  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return await confirm(message, { title, kind: "warning" });
}
