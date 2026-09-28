import { useNavigate } from 'react-router-dom';
import { FileText, Info, MessageSquarePlus, Scale, Users } from 'lucide-react';
import { useTheme } from '@/hooks/ui/useTheme';
import { Button } from '@/components/ui/button';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';

/** About: app version, blurb, quick stats, and legal links. */
export function AboutPanel() {
  const { themes } = useTheme();
  const navigate = useNavigate();
  const { closeSettings } = useSettingsModal();

  const go = (path: string) => {
    navigate(path);
    closeSettings();
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Info}
        eyebrow="About"
        title="Tatakai"
        description={`Version ${__APP_VERSION__} — an extension-based otaku community with Smart TV support, beautiful themes, and powerful media player features.`}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-center">
            <p className="text-2xl font-bold text-primary">{themes.length}</p>
            <p className="text-sm text-muted-foreground">Themes</p>
          </div>
          <div className="rounded-xl border border-secondary/20 bg-secondary/10 p-4 text-center">
            <p className="text-2xl font-bold text-secondary">∞</p>
            <p className="text-sm text-muted-foreground">Anime</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection icon={Scale} eyebrow="Legal" title="Legal & policies">
        <div className="flex flex-col">
          <SettingRow
            title="Terms & Conditions"
            icon={FileText}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/terms')}>
                View
              </Button>
            }
          />
          <SettingRow
            title="Community Guidelines"
            icon={Users}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/community-guidelines')}>
                View
              </Button>
            }
          />
          <SettingRow
            title="DMCA Policy"
            icon={Scale}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/dmca')}>
                View
              </Button>
            }
          />
          <SettingRow
            title="Send Feedback"
            description="Share suggestions and report issues."
            icon={MessageSquarePlus}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/suggestions')}>
                Open
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
