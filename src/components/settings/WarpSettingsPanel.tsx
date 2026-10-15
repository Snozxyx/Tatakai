import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import type { WarpStatus } from '@/types/electron-bridge';

/**
 * WARP tunnel controls (desktop only). The bridge, IPC and egress probe already
 * live in the main process (desktop/runtime/warp/warp-tunnel.cjs); this panel is
 * the renderer surface. Every mutation re-reads getWarpStatus() so the status
 * line reflects the real probe rather than the optimistic toggle state.
 *
 * NOTE: this routes flagged traffic through the in-app local proxy egress — it
 * does not stand up a WireGuard tunnel, so the Cloudflare trace may report
 * `warp=off` even while "connected" is true.
 */
export function WarpSettingsPanel() {
  useUiTranslation();
  const [status, setStatus] = useState<WarpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const rt = window.tatakaiRuntime;
    if (!rt?.getWarpStatus) {
      setLoading(false);
      return;
    }
    try {
      setStatus(await rt.getWarpStatus());
    } catch {
      /* leave last-known status in place */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown> | undefined) => {
      setBusy(true);
      try {
        await fn();
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const rt = typeof window !== 'undefined' ? window.tatakaiRuntime : undefined;
  const enabled = !!status?.enabled;
  const connected = !!status?.connected;

  const statusBadge = loading
    ? { tone: 'muted' as const, get label() { return uiI18n.t('app.checking_820d6004'); } }
    : connected
      ? { tone: 'success' as const, get label() { return uiI18n.t('app.connected_c2f9b7b4'); } }
      : enabled
        ? { tone: 'warning' as const, get label() { return uiI18n.t('app.connecting_fd3e7969'); } }
        : { tone: 'muted' as const, get label() { return uiI18n.t('app.off_e3de5ab0'); } };

  return (
    <SettingsSection
      icon={Globe}
      eyebrow="Network"
      title={uiI18n.t('app.warp_tunnel_7f900377')}
      description={uiI18n.t('app.route_flagged_traffic_through_the_in_app_warp_eg_02a2ae5b')}
      action={
        <div className="flex items-center gap-2">
          {(loading || busy) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={loading || busy || !rt?.toggleWarp}
            onCheckedChange={(v) => mutate(() => rt?.toggleWarp?.(v))}
            aria-label={uiI18n.t('app.enable_warp_tunnel_8af3301d')}
          />
        </div>
      }
    >
      <div className="flex flex-col">
        <SettingRow
          title={uiI18n.t('app.activation_mode_b5ab5a12')}
          description={uiI18n.t('app.auto_lets_the_app_decide_always_keeps_the_tunnel_8557914f')}
          control={
            <Select
              value={status?.mode || 'auto'}
              disabled={loading || busy || !rt?.setWarpMode}
              onValueChange={(mode) => mutate(() => rt?.setWarpMode?.(mode as WarpStatus['mode']))}
            >
              <SelectTrigger className="h-9 w-36 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{uiI18n.t('app.auto_c614ba7c')}</SelectItem>
                <SelectItem value="always">{uiI18n.t('app.always_a91bcce8')}</SelectItem>
                <SelectItem value="on-demand">{uiI18n.t('app.on_demand_e5c7975a')}</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingRow
          title={uiI18n.t('app.route_extension_traffic_35187033')}
          description={uiI18n.t('app.send_provider_extension_requests_through_the_tun_320113f2')}
          control={
            <Switch
              checked={status?.routeExtensions !== false}
              disabled={loading || busy || !rt?.setWarpRouting}
              onCheckedChange={(v) => mutate(() => rt?.setWarpRouting?.({ routeExtensions: v }))}
              aria-label={uiI18n.t('app.route_extension_traffic_through_warp_ef690b10')}
            />
          }
        />

        <SettingRow
          title={uiI18n.t('app.route_torrent_traffic_3855a9cf')}
          description={uiI18n.t('app.send_torrent_peer_tracker_traffic_through_the_tu_7a3f077e')}
          control={
            <Switch
              checked={status?.routeTorrent !== false}
              disabled={loading || busy || !rt?.setWarpRouting}
              onCheckedChange={(v) => mutate(() => rt?.setWarpRouting?.({ routeTorrent: v }))}
              aria-label={uiI18n.t('app.route_torrent_traffic_through_warp_841c4cb3')}
            />
          }
        />

        <SettingRow
          title={uiI18n.t('app.status_bae7d5be')}
          badge={<SettingsBadge tone={statusBadge.tone}>{statusBadge.label}</SettingsBadge>}
          description={
            status?.lastError
              ? uiI18n.t('app.last_probe_error_i18n_value_0_88c652ac', { value0: status.lastError })
              : connected
                ? uiI18n.t('app.egress_i18n_value_0i18n_value_1_15904c9e', { value0: status?.egressIp || 'unknown', value1: status?.egressCity ? ` · ${status.egressCity}` : '' })
                : uiI18n.t('app.the_tunnel_is_not_currently_routing_traffic_924929b5')
          }
        />
      </div>
    </SettingsSection>
  );
}
