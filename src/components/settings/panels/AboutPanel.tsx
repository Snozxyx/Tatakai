import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { DiagnosticsSettings } from '../DiagnosticsSettings';
import { useNavigate } from 'react-router-dom';
import { FileText, Info, MessageSquarePlus, Scale, ScrollText, Users } from 'lucide-react';
import { useTheme } from '@/hooks/ui/useTheme';
import { Button } from '@/components/ui/button';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';

/** About: app version, blurb, quick stats, changelog shortcut, and legal links. */
export function AboutPanel() {
  useUiTranslation();
  const { themes } = useTheme();
  const navigate = useNavigate();
  const { openSettings, closeSettings } = useSettingsModal();

  const go = (path: string) => {
    navigate(path);
    closeSettings();
  };

  // The `changelog` category is registered on every platform, so this is the
  // one-tap route to release notes from desktop, mobile, and web alike.
  const openChangelog = () => {
    openSettings('changelog');
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Info}
        eyebrow="About"
        title={uiI18n.t('app.tatakai_28bda6bd')}
        description={uiI18n.t('app.version_i18n_value_0_an_extension_based_otaku_co_93238098', { value0: __APP_VERSION__ })}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-center">
            <p className="text-2xl font-bold text-primary">{themes.length}</p>
            <p className="text-sm text-muted-foreground">{uiI18n.t('app.themes_94d5186b')}</p>
          </div>
          <div className="rounded-xl border border-secondary/20 bg-secondary/10 p-4 text-center">
            <p className="text-2xl font-bold text-secondary">∞</p>
            <p className="text-sm text-muted-foreground">{uiI18n.t('app.anime_f1b32a19')}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection icon={ScrollText} eyebrow="Releases" title={uiI18n.t('app.what_s_new_4d8dc5fe')}>
        <SettingRow
          title={uiI18n.t('app.changelog_164b3d48')}
          description={uiI18n.t('app.every_release_and_what_changed_in_it_043c0ff3')}
          icon={ScrollText}
          control={
            <Button variant="outline" size="sm" onClick={openChangelog}>
              {uiI18n.t('app.open_cf9b7706')}
            </Button>
          }
        />
      </SettingsSection>

      <DiagnosticsSettings />

      <SettingsSection icon={Scale} eyebrow="Legal" title={uiI18n.t('app.legal_policies_69a80df0')}>
        <div className="flex flex-col">
          <SettingRow
            title={uiI18n.t('app.terms_conditions_d35f2b98')}
            icon={FileText}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/terms')}>
                {uiI18n.t('app.view_69bd4ef9')}
              </Button>
            }
          />
          <SettingRow
            title={uiI18n.t('app.community_guidelines_75343669')}
            icon={Users}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/community-guidelines')}>
                {uiI18n.t('app.view_69bd4ef9')}
              </Button>
            }
          />
          <SettingRow
            title={uiI18n.t('app.dmca_policy_ff7bd6a8')}
            icon={Scale}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/dmca')}>
                {uiI18n.t('app.view_69bd4ef9')}
              </Button>
            }
          />
          <SettingRow
            title={uiI18n.t('app.send_feedback_083a7a6a')}
            description={uiI18n.t('app.share_suggestions_and_report_issues_1a107d28')}
            icon={MessageSquarePlus}
            control={
              <Button variant="outline" size="sm" onClick={() => go('/suggestions')}>
                {uiI18n.t('app.open_cf9b7706')}
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
