import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SettingsSection, SettingRow } from './SettingsPrimitives';
import { exportDiagnostics } from '@/core/diagnostics/export-diagnostics';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

export function DiagnosticsSettings() {
  const [busy, setBusy] = useState(false);
  return <SettingsSection title="Diagnostics" description="Export recent logs, extension versions, and provider health for a bug report. Credentials and local paths are removed.">
    <SettingRow title="Export diagnostics" description="Saved locally as a ZIP. Nothing is submitted automatically." control={
      <Button disabled={busy} onClick={async () => {
        setBusy(true);
        try { await exportDiagnostics(); toast.success('Diagnostics saved'); }
        catch (error) { toast.error(error instanceof Error ? error.message : 'Export failed'); }
        finally { setBusy(false); }
      }}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{busy ? 'Preparing…' : 'Export diagnostics'}</Button>
    } />
  </SettingsSection>;
}
