import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';
import { getDownloadAutoResume, setDownloadAutoResume } from '@/lib/downloadPreferences';
import { toast } from 'sonner';

export function DownloadResumeSetting() {
  const [enabled, setEnabled] = useState(getDownloadAutoResume);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void window.electron?.getDownloadRecovery?.().then(value => { if (!cancelled) setEnabled(value.autoResume); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return <SettingsSection title="Downloads" description="Continue interrupted anime and manga downloads.">
    <SettingRow icon={Download} title="Resume interrupted downloads" description="Automatically continue saved progress when the app opens. Enabled by default."
      control={<Switch aria-label="Resume interrupted downloads" checked={enabled} disabled={saving} onCheckedChange={async value => {
        setSaving(true);
        try { await setDownloadAutoResume(value); setEnabled(value); }
        catch { toast.error('Could not save resume preference'); }
        finally { setSaving(false); }
      }} />} />
  </SettingsSection>;
}
