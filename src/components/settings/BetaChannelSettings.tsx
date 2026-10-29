import { useUpdateState } from '@/core/update/update-monitor';
import { useMobileUpdateState } from '@/core/update/mobile-update';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getReleaseChannel, setReleaseChannel, useReleaseChannel } from '@/core/update/release-channel';
import { reportUpdateEvent } from '@/core/update/update-telemetry';
import { useTranslation } from 'react-i18next';

export function BetaSubscriptionSync() {
  const { user } = useAuth(); const channel = useReleaseChannel(); const cache = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.resolve(supabase.rpc('set_beta_subscription' as never, { p_enabled: channel === 'beta' } as never)).then(({ error }) => {
      if (!error && !cancelled) { void cache.invalidateQueries({ queryKey: ['user_badges', user.id] }); void cache.invalidateQueries({ queryKey: ['badge-rewards', user.id] }); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, channel, cache]);
  useEffect(() => {
    try {
      const previous = localStorage.getItem('tatakai:last-app-version');
      if (previous && previous !== __APP_VERSION__) reportUpdateEvent('installed');
      localStorage.setItem('tatakai:last-app-version', __APP_VERSION__);
    } catch { /* optional telemetry */ }
  }, []);
  return null;
}
export function BetaChannelSettings() {
  const channel = useReleaseChannel(); const { user } = useAuth(); const { t } = useTranslation();
  const desktop = useUpdateState(); const mobile = useMobileUpdateState();
  const busy = ['downloading','downloaded','installing'].includes(desktop.phase) || ['downloading','downloaded','installing'].includes(mobile.phase);
  const [changing, setChanging] = useState(false); const [error, setError] = useState('');
  return <section className="rounded-xl border border-border p-4 flex flex-col gap-3">
    <div className="flex items-center justify-between gap-4"><div className="flex flex-col gap-1"><Label htmlFor="beta-channel">{t('updates.betaTitle')}</Label><span className="text-xs text-muted-foreground">{t('updates.betaDescription')}</span></div><Switch id="beta-channel" checked={channel === 'beta'} disabled={changing || busy} onCheckedChange={async enabled => {
      setError(''); setChanging(true);
      try {
        if (user) { const { error } = await supabase.rpc('set_beta_subscription' as never, { p_enabled: enabled } as never); if (error) throw error; }
        setReleaseChannel(enabled ? 'beta' : 'production'); reportUpdateEvent(enabled ? 'opt_in' : 'opt_out');
        const bridge = (window as unknown as { electron?: { updateCheck?: (channel: string) => Promise<unknown> } }).electron;
        await bridge?.updateCheck?.(getReleaseChannel() === 'beta' ? 'beta' : 'stable');
      } catch { setError(t('updates.betaError')); } finally { setChanging(false); }
    }} /></div>
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{channel === 'beta' ? 'Beta' : t('updates.production')}</Badge><span className="text-xs text-muted-foreground">{user ? t('updates.betaBadge') : t('updates.betaGuest')}</span></div>
    <p className="text-xs text-muted-foreground">{t('updates.betaWarning')}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
