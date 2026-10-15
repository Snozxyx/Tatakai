import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect } from 'react';
import { Network, RefreshCw, CheckCircle2, RotateCcw, AlertTriangle, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { SettingsSection, SettingRow, SettingsBadge } from '@/components/settings/SettingsPrimitives';

export function ExtensionHostPortSetting() {
  useUiTranslation();
  const isNative = useIsNativeApp();
  const [currentPort, setCurrentPort] = useState<number | null>(8099);
  const [inputPort, setInputPort] = useState<string>('8099');
  const [baseUrl, setBaseUrl] = useState<string | null>('http://127.0.0.1:8099');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchPortInfo = async () => {
    if (!isNative) return;
    setIsLoading(true);
    try {
      const bridge = (window as any).electron?.getExtensionApiPort || (window as any).tatakaiRuntime?.getExtensionApiPort;
      if (bridge) {
        const res = await bridge();
        if (res) {
          const active = res.port || res.configuredPort || 8099;
          setCurrentPort(active);
          setInputPort(String(active));
          if (res.baseUrl) setBaseUrl(res.baseUrl);
        }
      }
    } catch (err) {
      console.error('Failed to get extension API host port:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPortInfo();
  }, [isNative]);

  const handleUpdatePort = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const portNum = Number(inputPort);
    if (!portNum || portNum < 1024 || portNum > 65535) {
      toast.error(uiI18n.t('app.port_must_be_a_number_between_1024_and_65535_0dd79de9'));
      return;
    }

    if (!isNative) {
      toast.info(uiI18n.t('app.extension_api_host_runs_in_the_desktop_electron__05ac8c09'));
      return;
    }

    setIsUpdating(true);
    try {
      const setBridge = (window as any).electron?.setExtensionApiPort || (window as any).tatakaiRuntime?.setExtensionApiPort;
      if (setBridge) {
        const res = await setBridge(portNum);
        if (res.success) {
          setCurrentPort(res.port || portNum);
          if (res.baseUrl) setBaseUrl(res.baseUrl);
          toast.success(uiI18n.t('app.extension_api_host_rebound_to_port_i18n_value_0_9ad62f6a', { value0: res.port || portNum }));
        } else {
          toast.error(uiI18n.t('app.port_update_failed_i18n_value_0_0ec86a5a', { value0: res.error || 'Unable to bind port' }));
        }
      } else {
        toast.error(uiI18n.t('app.port_configuration_bridge_is_not_available_89feb28b'));
      }
    } catch (err: any) {
      toast.error(uiI18n.t('app.error_i18n_value_0_6c651f8a', { value0: err.message }));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReset = async () => {
    setInputPort('8099');
    if (!isNative) return;
    setIsUpdating(true);
    try {
      const setBridge = (window as any).electron?.setExtensionApiPort || (window as any).tatakaiRuntime?.setExtensionApiPort;
      if (setBridge) {
        const res = await setBridge(8099);
        if (res.success) {
          setCurrentPort(8099);
          if (res.baseUrl) setBaseUrl(res.baseUrl);
          toast.success(uiI18n.t('app.extension_api_host_reset_to_default_port_8099_193093d3'));
        }
      }
    } catch (err: any) {
      toast.error(uiI18n.t('app.reset_error_i18n_value_0_6a546df2', { value0: err.message }));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SettingsSection
      icon={Radio}
      eyebrow="Runtime Supervisor [Advance]"
      title={uiI18n.t('app.extension_api_host_port_aeddd438')}
      description={uiI18n.t('app.the_in_process_loopback_server_that_mounts_local_7693235e')}
    >
      <div className="p-4 rounded-xl border border-white/5 bg-muted/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{uiI18n.t('app.server_listener_status_032bd9ef')}</span>
              <SettingsBadge tone="success">
                <CheckCircle2 className="h-3 w-3" /> {uiI18n.t('app.listening_on_0072b039')} {baseUrl || `http://127.0.0.1:${currentPort || 8099}`}
              </SettingsBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              {uiI18n.t('app.configured_port_438ad896')} <span className="font-mono text-foreground font-bold">{currentPort || 8099}</span> {uiI18n.t('app.default_8099_8e590ad2')}
            </p>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={fetchPortInfo}
            disabled={isLoading}
            className="h-8 text-xs text-muted-foreground border border-white/10 rounded-xl self-start sm:self-center"
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {uiI18n.t('app.check_status_99f3765b')}
          </Button>
        </div>

        <form onSubmit={handleUpdatePort} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
          <div className="relative w-full sm:w-48">
            <Input
              type="number"
              min={1024}
              max={65535}
              value={inputPort}
              onChange={(e) => setInputPort(e.target.value)}
              placeholder="8099"
              className="h-9 font-mono text-sm rounded-xl border-white/10 bg-background/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isUpdating || String(currentPort) === inputPort}
              className="h-9 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground"
            >
              {isUpdating ? 'Rebinding...' : uiI18n.t('app.save_rebind_port_5b881de8')}
            </Button>

            {String(currentPort) !== '8099' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={isUpdating}
                className="h-9 px-3 rounded-xl text-xs border-white/10 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {uiI18n.t('app.reset_8099_f4a58430')}
              </Button>
            )}
          </div>
        </form>

        
      </div>
    </SettingsSection>
  );
}
