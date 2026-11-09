import { lazy, Suspense, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { addonConfiguration, type ConfigurationDraft } from '@/core/extensions/remote/configuration';
import uiI18n from '@/lib/uiI18n';
const AddExtensionModal = lazy(() => import('./SideloadExtensionModal').then(module => ({ default: module.AddExtensionModal })));

/** Mounted once at the app root: a restored native activity returns to a preview, never an install. */
export function ExtensionConfigurationBridge() {
  const [draft, setDraft] = useState<(ConfigurationDraft & { manifest?: Record<string, any> }) | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const interrupted = addonConfiguration.pending();
    if (interrupted) setDraft(interrupted);
    void import('@capacitor/app').then(async ({ App }) => {
      if (disposed) return;
      const handle = await App.addListener('appRestoredResult', async event => {
        if (disposed) return;
        if (event.pluginId !== 'TatakaiExtensionConfig' || event.methodName !== 'configure') return;
        if (!event.success) {
          if (!disposed && addonConfiguration.pending()?.requestId === interrupted?.requestId) toast.error(uiI18n.t('extensionSetup.restoreFailed'));
          return;
        }
        try {
          const configured = await addonConfiguration.restore(event.data);
          if (!disposed && configured) setDraft(configured);
          else if (!disposed && event.data?.success === false && event.data?.requestId === interrupted?.requestId) setDraft(null);
        } catch (error) {
          if (!disposed) toast.error(error instanceof Error ? error.message : uiI18n.t('extensionSetup.restoreFailed'));
        }
      });
      if (disposed) void handle.remove();
      else cleanup = () => { void handle.remove(); };
    }).catch(() => undefined);
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return draft ? <Suspense fallback={null}><AddExtensionModal key={draft.requestId} isOpen initialUrl={draft.manifestUrl} existingId={draft.existingId}
    initialManifest={draft.manifest} expectedAddonId={draft.expectedAddonId}
    onClose={() => { addonConfiguration.cancel(); setDraft(null); }} /></Suspense> : null;
}
