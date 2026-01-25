import { isTauri } from "@/lib/platform";

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";

  if (!isTauri()) {
    return await Notification.requestPermission();
  }

  const { requestPermission } = await import("@tauri-apps/plugin-notification");
  return await requestPermission();
}

export async function notify(title: string, body?: string): Promise<void> {
  if (!isTauri()) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, body ? { body } : undefined);
    }
    return;
  }

  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title, body });
}
