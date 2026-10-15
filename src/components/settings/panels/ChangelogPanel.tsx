import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { ScrollText } from 'lucide-react';
import { CHANGELOG } from '@/lib/changelog';
import { SettingRow, SettingsBadge, SettingsSection } from '@/components/settings/SettingsPrimitives';

/** Changelog: hardcoded release history from `@/lib/changelog`. */
export function ChangelogPanel() {
  useUiTranslation();
  return (
    <SettingsSection icon={ScrollText} eyebrow="Releases" title={uiI18n.t('app.changelog_164b3d48')}>
      <div className="flex flex-col">
        {CHANGELOG.map((release, index) => (
          <SettingRow
            key={release.version}
            tone={index === 0 ? 'accent' : 'default'}
            title={
              <>
                <span>v{release.version}</span>
                {index === 0 && <SettingsBadge tone="success">{uiI18n.t('app.latest_decd7ca8')}</SettingsBadge>}
              </>
            }
            description={release.date}
          >
            <ul className="space-y-2">
              {release.changes.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 text-primary">•</span>
                  <span className="text-foreground/80">{change}</span>
                </li>
              ))}
            </ul>
          </SettingRow>
        ))}
      </div>
    </SettingsSection>
  );
}
