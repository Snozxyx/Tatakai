import { useEffect, useState } from 'react';
import { DEVELOPER_MODE_EVENT, isDeveloperModeEnabled, setDeveloperModeEnabled } from '@/lib/developerMode';

export function useDeveloperMode() {
  const [enabled, setEnabled] = useState(isDeveloperModeEnabled);
  useEffect(() => {
    const refresh = () => setEnabled(isDeveloperModeEnabled());
    for (const event of ['storage', DEVELOPER_MODE_EVENT, 'tatakai-mobile-config-updated']) window.addEventListener(event, refresh);
    refresh();
    return () => { for (const event of ['storage', DEVELOPER_MODE_EVENT, 'tatakai-mobile-config-updated']) window.removeEventListener(event, refresh); };
  }, []);
  return { enabled, setEnabled: setDeveloperModeEnabled };
}
