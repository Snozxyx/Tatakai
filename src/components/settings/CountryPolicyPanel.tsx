import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
  const policy = useCountryPolicy();
  const [refreshKey, setRefreshKey] = useState(0);

  const isPermitted = policy.badge.label === 'Permitted';
  const isUnknown = policy.badge.label === 'Unknown';
  const badgeTone: SettingsTone = isPermitted ? 'success' : isUnknown ? 'muted' : 'warning';

  return (
    <SettingsSection
      title={uiI18n.t('app.country_policy_346b76a4')}
      description={uiI18n.t('app.torrent_legality_in_your_region_informational_on_476ac9b4')}
      action={
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-muted-foreground hover:text-foreground"
          onClick={() => setRefreshKey((k) => k + 1)}
          title={uiI18n.t('app.re_check_location_d4424053')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      }
      bodyClassName="space-y-4"
    >
      {policy.loading ? (
        <div key={refreshKey} className="flex items-center gap-3 py-3.5 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{uiI18n.t('app.detecting_location_51692f6b')}</span>
        </div>
      ) : (
        <div key={refreshKey} className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.country_d523ebbd')}
            icon={Globe}
            control={
              <span className="text-sm font-semibold text-foreground">
                {policy.countryName || policy.countryCode || uiI18n.t('app.unknown_bc7819b3')}
              </span>
            }
          />
          <SettingRow
            title={uiI18n.t('app.ip_address_99a1caa5')}
            control={
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-foreground">
                  {policy.displayedIp || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => policy.setRevealIp(!policy.revealIp)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={policy.revealIp ? uiI18n.t('app.hide_ip_3885b1a2') : uiI18n.t('app.reveal_ip_be9caf3c')}
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
            title={uiI18n.t('app.torrent_legality_0041b461')}
            description={policy.policy?.note || undefined}
            control={<SettingsBadge tone={badgeTone}>{policy.badge.label}</SettingsBadge>}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        {uiI18n.t('app.this_is_informational_only_tatakai_does_not_bloc_2bb02dbd')}
      </p>

      {!isPermitted && !policy.loading && (
        <a
          href="https://one.one.one.one/dns/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors group"
        >
          <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          {uiI18n.t('app.learn_about_warp_by_cloudflare_for_private_dns_4843344a')}
        </a>
      )}
    </SettingsSection>
  );
}
