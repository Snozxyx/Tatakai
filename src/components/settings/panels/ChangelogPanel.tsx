import { ScrollText } from 'lucide-react';
import { CHANGELOG } from '@/lib/changelog';
import { SettingRow, SettingsBadge, SettingsSection } from '@/components/settings/SettingsPrimitives';

/** Changelog: hardcoded release history from `@/lib/changelog`. */
export function ChangelogPanel() {
  return (
    <SettingsSection icon={ScrollText} eyebrow="Releases" title="Changelog">
      <div className="flex flex-col">
        {CHANGELOG.map((release, index) => (
          <SettingRow
            key={release.version}
            tone={index === 0 ? 'accent' : 'default'}
            title={
              <>
                <span>v{release.version}</span>
                {index === 0 && <SettingsBadge tone="success">Latest</SettingsBadge>}
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
