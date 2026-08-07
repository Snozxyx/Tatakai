import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MonitorPlay, CheckCircle2, PlaySquare, Settings2, ShieldAlert, Plus, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useVideoSettings } from '@/hooks/media/useVideoSettings';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExternalPlayer {
  id: string;
  name: string;
  description: string;
  executablePath: string;
}

export function ExternalPlayerSettings() {
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
          setError('External player feature requires Tatakai Desktop.');
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
          setError(detectRes.error || 'Failed to detect players');
        }

        if (prefRes?.executablePath) {
          setSelectedPath(prefRes.executablePath);
        }
      } catch (err: any) {
        setError(err.message || 'Error loading player settings');
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
         toast.error('File selection is only available on Desktop.');
         return;
      }
      
      const path = await rt.selectFile({
        title: 'Select External Player Executable',
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
        <span className="text-sm">Detecting external players…</span>
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
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
          <MonitorPlay className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-medium text-foreground">External Player</h3>
          <p className="text-xs text-muted-foreground">Open streams directly in MPV, VLC, or MPC-HC</p>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="p-4 rounded-xl bg-muted/20 border border-border text-sm text-muted-foreground text-center">
          No supported external players detected on your system.
          <br />
          <span className="text-xs">Supported: MPV, VLC, MPC-HC, MPC-BE</span>
        </div>
      ) : (
        <div className="grid gap-2">
          {/* Default/Internal Option */}
          <button
            onClick={handleClear}
            className={cn(
              'flex items-center justify-between p-3 rounded-xl border text-left transition-colors',
              !selectedPath
                ? 'bg-primary/5 border-primary/40'
                : 'bg-background/50 border-border hover:bg-muted/40'
            )}
          >
            <div className="flex items-center gap-3">
              <PlaySquare className={cn('w-5 h-5', !selectedPath ? 'text-primary' : 'text-muted-foreground')} />
              <div>
                <p className="text-sm font-medium text-foreground">Built-in Player</p>
                <p className="text-xs text-muted-foreground">Tatakai's internal video player</p>
              </div>
            </div>
            {!selectedPath && <CheckCircle2 className="w-5 h-5 text-primary" />}
          </button>

          {/* Detected External Players */}
          {players.map((player) => {
            const isSelected = selectedPath === player.executablePath;
            return (
              <button
                key={player.executablePath}
                onClick={() => handleSelect(player.executablePath)}
                className={cn(
                  'flex items-center justify-between p-3 rounded-xl border text-left transition-colors',
                  isSelected
                    ? 'bg-primary/5 border-primary/40'
                    : 'bg-background/50 border-border hover:bg-muted/40'
                )}
              >
                <div className="flex items-center gap-3">
                  <Settings2 className={cn('w-5 h-5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{player.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[300px]">
                      {player.executablePath}
                    </p>
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
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
                   Add custom player path...
                </Button>
             ) : (
                <div className="space-y-3 p-3 rounded-xl bg-black/20 border border-white/5">
                   <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custom Executable Path</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowManualInput(false)}>
                         <X className="w-3 h-3" />
                      </Button>
                   </div>
                   <div className="flex gap-2">
                      <Input 
                        value={manualPath}
                        onChange={(e) => setManualPath(e.target.value)}
                        placeholder="C:\Path\to\player.exe"
                        className="h-9 text-xs bg-black/40"
                      />
                      <Button variant="secondary" size="sm" onClick={handleSelectManualPath}>
                         Browse
                      </Button>
                   </div>
                   {manualPath && (
                      <Button 
                        className="w-full h-8 text-xs font-bold" 
                        onClick={() => handleSelect(manualPath)}
                        disabled={selectedPath === manualPath}
                      >
                         {selectedPath === manualPath ? 'Currently Selected' : 'Set as Preferred Player'}
                      </Button>
                   )}
                </div>
             )}

             {/* Auto-launch toggle */}
             {selectedPath && (
                <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/10 shadow-inner">
                   <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-primary/20">
                         <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                         <h4 className="text-sm font-bold tracking-tight">Launch Automatically</h4>
                         <p className="text-[10px] text-muted-foreground">Always use external player when a stream starts</p>
                      </div>
                   </div>
                   <Switch 
                     checked={settings.alwaysUseExternalPlayer}
                     onCheckedChange={(checked) => updateSetting('alwaysUseExternalPlayer', checked)}
                   />
                </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
