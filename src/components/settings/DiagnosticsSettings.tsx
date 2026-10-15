import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingRow } from './SettingsPrimitives';
import { exportDiagnostics } from '@/core/diagnostics/export-diagnostics';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

export function DiagnosticsSettings() {
  useUiTranslation();
  const [busy, setBusy] = useState(false);
  return <SettingsSection title={uiI18n.t('app.diagnostics_3af2279f')} description={uiI18n.t('app.export_recent_logs_extension_versions_and_provid_355b22ae')}>
    <SettingRow title={uiI18n.t('app.export_diagnostics_3e5cd822')} description={uiI18n.t('app.saved_locally_as_a_zip_nothing_is_submitted_auto_f3e7fded')} control={
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        try { await exportDiagnostics(); toast.success(uiI18n.t('app.diagnostics_saved_174a96f8')); }
        catch (error) { toast.error(error instanceof Error ? error.message : uiI18n.t('app.export_failed_d6c17e9b')); }
        finally { setBusy(false); }
      }}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{busy ? uiI18n.t('app.preparing_0b1d6c0b') : uiI18n.t('app.export_diagnostics_3e5cd822')}</Button>
    } />
  </SettingsSection>;
}
