import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LogoChoice, CustomThemeDefinitions } from './customization';
import { resolveColors } from '@/hooks/ui/useTheme';

export type LogoVariant = Exclude<LogoChoice, 'auto'>;
export type LauncherMode = LogoChoice;
export interface LauncherSelection { success: boolean; mode: LauncherMode; variant: LogoVariant; error?: string; limitations?: string[] }
export interface BrandingCapabilities { success: boolean; supported: boolean; platform: string; automatic: boolean; limitations: string[] }
export interface BrandingBridge {
  getCapabilities(): Promise<BrandingCapabilities>;
  getSelection(): Promise<LauncherSelection>;
  setSelection(input: { mode: LauncherMode; resolvedVariant?: LogoVariant }): Promise<LauncherSelection>;
}
export function resolveLogoVariant(choice: LogoChoice | undefined, theme: string, customThemes?: CustomThemeDefinitions): LogoVariant {
  return choice && choice !== 'auto' && ['dark', 'light', 'monochrome', 'legacy'].includes(choice) ? choice : resolveColors(theme, customThemes).isLight ? 'light' : 'dark';
}
export function brandLogoSource(variant: LogoVariant): string { return `${import.meta.env.BASE_URL}assets/branding/${variant}.png`; }
let mobile: BrandingBridge | undefined;
export function getBrandingBridge(): BrandingBridge | null {
  if (typeof window !== 'undefined' && window.electron?.branding) return window.electron.branding;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TatakaiBranding')) return mobile ??= registerPlugin<BrandingBridge>('TatakaiBranding');
  return null;
}
let operations: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const task = operations.catch(() => undefined).then(operation);
  operations = task; return task;
}
/** Call only from Save. Preview components never use this mutation. */
export function saveLauncherSelection(mode: LauncherMode, resolvedVariant: LogoVariant): Promise<LauncherSelection> {
  return serialize(async () => {
    const bridge = getBrandingBridge();
    if (!bridge) return { success: false, mode, variant: resolvedVariant, error: 'customization.launcherUnavailable' };
    const result = await bridge.setSelection({ mode, resolvedVariant });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tatakai-launcher-selection', { detail: result }));
    return result;
  });
}
/** Consume committed preferences only, and preserve a device's manual choice. */
export function syncCommittedLauncher(variant: LogoVariant): Promise<LauncherSelection | null> {
  return serialize(async () => {
    const bridge = getBrandingBridge(); if (!bridge) return null;
    const capabilities = await bridge.getCapabilities();
    if (!capabilities.supported || !capabilities.automatic) return null;
    const saved = await bridge.getSelection();
    if (!saved.success || saved.mode !== 'auto' || saved.variant === variant) return saved;
    return bridge.setSelection({ mode: 'auto', resolvedVariant: variant });
  });
}
