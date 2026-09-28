import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSettingsModal } from '@/contexts/SettingsModalContext';

/**
 * Thin opener for the legacy `/settings` route. Settings is now a modal, but
 * external/bookmarked links like `/settings?tab=integrations` must still work:
 * open the requested category, then replace the route with home so the URL
 * doesn't linger.
 */
export function SettingsRouteOpener() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();

  useEffect(() => {
    const tab = params.get('tab') || undefined;
    const section = params.get('section') || undefined;
    openSettings(tab, section);
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
