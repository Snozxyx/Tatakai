import { useState } from 'react';
import { Globe, Eye, EyeOff, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCountryPolicy } from '@/core/country-policy/useCountryPolicy';
import { Button } from '@/components/ui/button';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
  type SettingsTone,
} from '@/components/settings/SettingsPrimitives';

export function CountryPolicyPanel() {
  const policy = useCountryPolicy();
  const [refreshKey, setRefreshKey] = useState(0);

  const isPermitted = policy.badge.label === 'Permitted';
  const isUnknown = policy.badge.label === 'Unknown';
  const badgeTone: SettingsTone = isPermitted ? 'success' : isUnknown ? 'muted' : 'warning';

  return (
    <SettingsSection
      title="Country Policy"
      description="Torrent legality in your region — informational only."
      action={
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Re-check location"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      }
      bodyClassName="space-y-4"
    >
      {policy.loading ? (
        <div key={refreshKey} className="flex items-center gap-3 py-3.5 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Detecting location…</span>
        </div>
      ) : (
        <div key={refreshKey} className="flex flex-col">
          <SettingRow
            title="Country"
            icon={Globe}
            control={
              <span className="text-sm font-semibold text-foreground">
                {policy.countryName || policy.countryCode || 'Unknown'}
              </span>
            }
          />
          <SettingRow
            title="IP address"
            control={
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-foreground">
                  {policy.displayedIp || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => policy.setRevealIp(!policy.revealIp)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={policy.revealIp ? 'Hide IP' : 'Reveal IP'}
                >
                  {policy.revealIp ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            }
          />
          <SettingRow
            title="Torrent legality"
            description={policy.policy?.note || undefined}
            control={<SettingsBadge tone={badgeTone}>{policy.badge.label}</SettingsBadge>}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        This is informational only. Tatakai does not block features based on country — you remain
        responsible for compliance with local laws.
      </p>

      {!isPermitted && !policy.loading && (
        <a
          href="https://one.one.one.one/dns/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors group"
        >
          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          Learn about WARP by Cloudflare for private DNS
        </a>
      )}
    </SettingsSection>
  );
}
