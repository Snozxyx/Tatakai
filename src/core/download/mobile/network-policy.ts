import { Capacitor, registerPlugin } from '@capacitor/core';
export const AUTOMATION_WIFI_KEY = 'tatakai:automation-wifi-only';
export async function automaticTransferAllowed(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  if (localStorage.getItem(AUTOMATION_WIFI_KEY) === 'false') return true;
  if (!Capacitor.isPluginAvailable('TatakaiMedia')) return false;
  try { return (await registerPlugin<{ networkStatus(): Promise<{ wifi: boolean }> }>('TatakaiMedia').networkStatus()).wifi; }
  catch { return false; }
}
