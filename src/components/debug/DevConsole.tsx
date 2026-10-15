import { Terminal } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useDeveloperMode } from '@/hooks/ui/useDeveloperMode';

/** Mobile launcher for the shared production-capable console; capture is owned once. */
export function DevConsole() {
  useUiTranslation();
  const { enabled } = useDeveloperMode();
  if (!enabled || !Capacitor.isNativePlatform()) return null;
  return (
    <button
      type="button"
      aria-label={uiI18n.t('app.dev_console_1425373e')}
      onClick={() =>
        window.dispatchEvent(new Event('tatakai:toggle-log-viewer'))
      }
      className="fixed bottom-20 right-4 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
    >
      <Terminal className="h-6 w-6" />
    </button>
  );
}
