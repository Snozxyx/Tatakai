export const DEVELOPER_MODE_KEY = 'tatakai_developer_mode';
export const DEVELOPER_MODE_EVENT = 'tatakai:developer-mode-changed';

/** Developer UI requires an explicit user setting, including in development builds. */
export function isDeveloperModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEVELOPER_MODE_KEY) === 'true'
      || JSON.parse(window.localStorage.getItem('tatakai_mobile_config') || '{}')?.devMode === true;
  } catch { return false; }
}

export function setDeveloperModeEnabled(enabled: boolean): void {
  window.localStorage.setItem(DEVELOPER_MODE_KEY, String(enabled));
  window.dispatchEvent(new Event(DEVELOPER_MODE_EVENT));
}
