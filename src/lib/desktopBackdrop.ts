import { useEffect, useSyncExternalStore } from 'react';

export type DesktopBackdropMode = 'solid' | 'transparent' | 'system-blur';
export interface DesktopBackdropCapabilities { supported: boolean; transparentSupported?: boolean; platform: string; material?: string; reason?: string }
export interface DesktopBackdropSelection { mode: DesktopBackdropMode; activeMode?: DesktopBackdropMode; opacity?: number; supported?: boolean; material?: string; restartRequired?: boolean }
export interface DesktopBackdropBridge {
  getCapabilities(): Promise<DesktopBackdropCapabilities>;
  getSelection(): Promise<DesktopBackdropSelection>;
  setSelection(input: { mode: DesktopBackdropMode; opacity?: number }): Promise<DesktopBackdropSelection & { success: boolean; error?: string }>;
}
interface Snapshot { ready: boolean; capabilities: DesktopBackdropCapabilities | null; selection: DesktopBackdropSelection | null; error?: string }
let snapshot: Snapshot = { ready: false, capabilities: null, selection: null };
let loading: Promise<void> | undefined;
const listeners = new Set<() => void>();
export function getDesktopBackdropBridge(): DesktopBackdropBridge | null {
  return typeof window !== 'undefined' ? window.electron?.backdrop as DesktopBackdropBridge || null : null;
}
function publish(next: Snapshot) { snapshot = next; for (const listener of listeners) listener(); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export async function loadDesktopBackdrop() {
  if (loading) return loading;
  loading = (async () => {
    const bridge = getDesktopBackdropBridge();
    if (!bridge) { publish({ ready: true, capabilities: null, selection: null }); return; }
    try {
      const [capabilities, selection] = await Promise.all([bridge.getCapabilities(), bridge.getSelection()]);
      publish({ ready: true, capabilities, selection });
    } catch { publish({ ready: true, capabilities: null, selection: null, error: 'customization.backdrop.unavailable' }); }
  })();
  return loading;
}
/** Native mode changes occur only when this function is called from Save. */
export async function saveDesktopBackdrop(mode: DesktopBackdropMode, opacity = 0.82) {
  const bridge = getDesktopBackdropBridge();
  if (!bridge) return { success: false, mode, error: 'customization.backdrop.unavailable' };
  const result = await bridge.setSelection({ mode, opacity });
  if (result.success) publish({ ...snapshot, selection: result, error: undefined });
  else {
    const selection = await bridge.getSelection().catch(() => snapshot.selection);
    publish({ ...snapshot, selection, error: result.error || 'customization.backdrop.failed' });
  }
  return result;
}
export function useDesktopBackdrop() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  useEffect(() => { void loadDesktopBackdrop(); }, []);
  return state;
}
