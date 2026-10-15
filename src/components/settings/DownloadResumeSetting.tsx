import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { getDownloadAutoResume, setDownloadAutoResume } from '@/lib/downloadPreferences';
import { toast } from 'sonner';

export function DownloadResumeSetting() {
  useUiTranslation();
  const [enabled, setEnabled] = useState(getDownloadAutoResume);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void window.electron?.getDownloadRecovery?.().then(value => { if (!cancelled) setEnabled(value.autoResume); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return <SettingsSection title={uiI18n.t('app.downloads_a862c2b2')} description={uiI18n.t('app.continue_interrupted_anime_and_manga_downloads_a84e7c6b')}>
    <SettingRow icon={Download} title={uiI18n.t('app.resume_interrupted_downloads_56cbe23b')} description={uiI18n.t('app.automatically_continue_saved_progress_when_the_a_31a46170')}
      control={<Switch aria-label={uiI18n.t('app.resume_interrupted_downloads_56cbe23b')} checked={enabled} disabled={saving} onCheckedChange={async value => {
        setSaving(true);
        try { await setDownloadAutoResume(value); setEnabled(value); }
        catch { toast.error(uiI18n.t('app.could_not_save_resume_preference_fd534467')); }
        finally { setSaving(false); }
      }} />} />
  </SettingsSection>;
}
