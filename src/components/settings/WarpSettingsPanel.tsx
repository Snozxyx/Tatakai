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
    ? { tone: 'muted' as const, label: 'Checking…' }
    : connected
      ? { tone: 'success' as const, label: 'Connected' }
      : enabled
        ? { tone: 'warning' as const, label: 'Connecting…' }
        : { tone: 'muted' as const, label: 'Off' };

  return (
    <SettingsSection
      icon={Globe}
      eyebrow="Network"
      title="WARP tunnel"
      description="Route flagged traffic through the in-app WARP egress. Choose when it activates and which traffic it covers."
      action={
        <div className="flex items-center gap-2">
          {(loading || busy) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={loading || busy || !rt?.toggleWarp}
            onCheckedChange={(v) => mutate(() => rt?.toggleWarp?.(v))}
            aria-label="Enable WARP tunnel"
          />
        </div>
      }
    >
      <div className="flex flex-col">
        <SettingRow
          title="Activation mode"
          description="Auto lets the app decide; Always keeps the tunnel up; On-demand routes only when a source needs it."
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
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="always">Always</SelectItem>
                <SelectItem value="on-demand">On-demand</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingRow
          title="Route extension traffic"
          description="Send provider / extension requests through the tunnel."
          control={
            <Switch
              checked={status?.routeExtensions !== false}
              disabled={loading || busy || !rt?.setWarpRouting}
              onCheckedChange={(v) => mutate(() => rt?.setWarpRouting?.({ routeExtensions: v }))}
              aria-label="Route extension traffic through WARP"
            />
          }
        />

        <SettingRow
          title="Route torrent traffic"
          description="Send torrent peer / tracker traffic through the tunnel."
          control={
            <Switch
              checked={status?.routeTorrent !== false}
              disabled={loading || busy || !rt?.setWarpRouting}
              onCheckedChange={(v) => mutate(() => rt?.setWarpRouting?.({ routeTorrent: v }))}
              aria-label="Route torrent traffic through WARP"
            />
          }
        />

        <SettingRow
          title="Status"
          badge={<SettingsBadge tone={statusBadge.tone}>{statusBadge.label}</SettingsBadge>}
          description={
            status?.lastError
              ? `Last probe error: ${status.lastError}`
              : connected
                ? `Egress ${status?.egressIp || 'unknown'}${status?.egressCity ? ` · ${status.egressCity}` : ''}`
                : 'The tunnel is not currently routing traffic.'
          }
        />
      </div>
    </SettingsSection>
  );
}
