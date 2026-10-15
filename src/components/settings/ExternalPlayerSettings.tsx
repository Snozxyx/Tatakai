import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorPlay, CheckCircle2, PlaySquare, Settings2, ShieldAlert, Plus, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useVideoSettings } from '@/hooks/media/useVideoSettings';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow } from '@/components/settings/SettingsPrimitives';

interface ExternalPlayer {
  id: string;
  name: string;
  description: string;
  executablePath: string;
}

export function ExternalPlayerSettings() {
  useUiTranslation();
  const [players, setPlayers] = useState<ExternalPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState(false);
  const { settings, updateSetting } = useVideoSettings();

  useEffect(() => {
    const init = async () => {
      try {
        const rt = (window as any).tatakaiRuntime;
        if (!rt?.detectExternalPlayers) {
          setError(uiI18n.t('app.external_player_feature_requires_tatakai_desktop_40ecb066'));
          setLoading(false);
          return;
        }

        const [detectRes, prefRes] = await Promise.all([
          rt.detectExternalPlayers(),
          rt.getExternalPlayerPref()
        ]);

        if (detectRes.success) {
          setPlayers(detectRes.players);
        } else {
          setError(detectRes.error || uiI18n.t('app.failed_to_detect_players_e0921332'));
        }

        if (prefRes?.executablePath) {
          setSelectedPath(prefRes.executablePath);
        }
      } catch (err: any) {
        setError(err.message || uiI18n.t('app.error_loading_player_settings_3c941a0e'));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSelect = async (path: string) => {
    try {
      const rt = (window as any).tatakaiRuntime;
      if (!rt) return;
      await rt.saveExternalPlayerPref(path);
      setSelectedPath(path);
    } catch (err: any) {
      console.error('Failed to save preference', err);
    }
  };

  const handleClear = async () => {
    try {
      const rt = (window as any).tatakaiRuntime;
      if (!rt) return;
      await rt.saveExternalPlayerPref(null);
      setSelectedPath(null);
    } catch (err: any) {
      console.error('Failed to clear preference', err);
    }
  };

  const handleSelectManualPath = async () => {
    try {
      const rt = (window as any).electron;
      if (!rt?.selectFile) {
         toast.error(uiI18n.t('app.file_selection_is_only_available_on_desktop_8b00b684'));
         return;
      }
      
      const path = await rt.selectFile({
        get title() { return uiI18n.t('app.select_external_player_executable_b66acd50'); },
        filters: [{ name: 'Executables', extensions: ['exe', 'app', 'sh'] }]
      });

      if (path) {
        setManualPath(path);
        handleSelect(path);
      }
    } catch (err) {
      console.error('Failed to select file', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground p-4">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{uiI18n.t('app.detecting_external_players_ff0000b2')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
        <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <SettingsSection
      title={uiI18n.t('app.external_player_d6d6f3a4')}
      description={uiI18n.t('app.open_streams_directly_in_mpv_vlc_or_mpc_hc_c0d6c318')}
    >
      {players.length === 0 ? (
        <div className="p-4 rounded-xl bg-muted/20 border border-border text-sm text-muted-foreground text-center">
          {uiI18n.t('app.no_supported_external_players_detected_on_your_s_00eecad0')}
          <br />
          <span className="text-xs">{uiI18n.t('app.supported_mpv_vlc_mpc_hc_mpc_be_26354fd6')}</span>
        </div>
      ) : (
        <div className="grid gap-2">
          {/* Default/Internal Option */}
          <button
            onClick={handleClear}
            className={cn(
              'flex w-full items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors',
              !selectedPath
                ? 'bg-primary/5 border-primary/40'
                : 'bg-background/50 border-border hover:bg-muted/40'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PlaySquare className={cn('w-5 h-5 shrink-0', !selectedPath ? 'text-primary' : 'text-muted-foreground')} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{uiI18n.t('app.built_in_player_62eea64f')}</p>
                <p className="text-xs text-muted-foreground truncate">{uiI18n.t('app.tatakai_s_internal_video_player_de18d7e1')}</p>
              </div>
            </div>
            {!selectedPath && <CheckCircle2 className="w-5 h-5 shrink-0 text-primary" />}
          </button>

          {/* Detected External Players */}
          {players.map((player) => {
            const isSelected = selectedPath === player.executablePath;
            return (
              <button
                key={player.executablePath}
                onClick={() => handleSelect(player.executablePath)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 p-3 rounded-xl border text-left transition-colors',
                  isSelected
                    ? 'bg-primary/5 border-primary/40'
                    : 'bg-background/50 border-border hover:bg-muted/40'
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Settings2 className={cn('w-5 h-5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{player.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {player.executablePath}
                    </p>
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 shrink-0 text-primary" />}
              </button>
            );
          })}

          {/* Manual Path Entry */}
          <div className="mt-2 pt-2 border-t border-white/5 space-y-4">
             {!showManualInput ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowManualInput(true)}
                  className="w-full justify-start text-xs text-muted-foreground hover:text-primary"
                >
                   <Plus className="w-3 h-3 mr-2" />
                   {uiI18n.t('app.add_custom_player_path_c71f1711')}
                </Button>
             ) : (
                <div className="space-y-3 p-3 rounded-xl bg-black/20 border border-white/5">
                   <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{uiI18n.t('app.custom_executable_path_45bbc0e5')}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowManualInput(false)}>
                         <X className="w-3 h-3" />
                      </Button>
                   </div>
                   <div className="flex gap-2">
                      <Input 
                        value={manualPath}
                        onChange={(e) => setManualPath(e.target.value)}
                        placeholder={uiI18n.t('app.c_path_to_player_exe_c2c2de74')}
                        className="h-9 text-xs bg-black/40"
                      />
                      <Button variant="secondary" size="sm" onClick={handleSelectManualPath}>
                         {uiI18n.t('app.browse_2f3b5c55')}
                      </Button>
                   </div>
                   {manualPath && (
                      <Button 
                        className="w-full h-8 text-xs font-bold" 
                        onClick={() => handleSelect(manualPath)}
                        disabled={selectedPath === manualPath}
                      >
                         {selectedPath === manualPath ? uiI18n.t('app.currently_selected_ca576636') : uiI18n.t('app.set_as_preferred_player_b1759ca0')}
                      </Button>
                   )}
                </div>
             )}

             {/* Auto-launch toggle */}
             {selectedPath && (
                <SettingRow
                  tone="accent"
                  icon={Zap}
                  title={uiI18n.t('app.launch_automatically_944cdc53')}
                  description={uiI18n.t('app.always_use_external_player_when_a_stream_starts_e1141caf')}
                  control={
                    <Switch
                      checked={settings.alwaysUseExternalPlayer}
                      onCheckedChange={(checked) => updateSetting('alwaysUseExternalPlayer', checked)}
                    />
                  }
                />
             )}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
