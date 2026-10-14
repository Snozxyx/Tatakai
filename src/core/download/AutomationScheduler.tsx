import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { checkAndRunAutomation } from './automation-engine';
export function AutomationScheduler() {
  useEffect(() => {
    const run = () => { if (document.visibilityState !== 'hidden') void checkAndRunAutomation().catch(() => {}); };
    const initial = setTimeout(run, 30_000);
    const interval = setInterval(run, 30 * 60_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisibility);
    const listener = Capacitor.isNativePlatform() ? App.addListener('appStateChange', state => { if (state.isActive) run(); }) : undefined;
    return () => { clearTimeout(initial); clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); void listener?.then(handle => handle.remove()); };
  }, []);
  return null;
}
