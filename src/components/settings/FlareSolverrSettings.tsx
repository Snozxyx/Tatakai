import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle2, XCircle, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

type FlareSolverrStatus = {
  enabled: boolean;
  url: string;
  available: boolean | null;
};

type BypassMode = 'playwright' | 'flaresolverr' | 'embedded';

function getRuntime() {
  return (typeof window !== 'undefined' ? window : {}) as any;
}

async function invokeFlaresolverr(channel: string, args?: unknown) {
  const w = getRuntime();
  const invoke = w.tatakaiRuntime?.invoke || w.electron?.invoke;
  if (!invoke) throw new Error('Desktop runtime unavailable');
  return invoke(channel, args);
}

export function FlareSolverrSettings() {
  const isDesktop = useIsDesktopApp();
  const [url, setUrl] = useState('http://localhost:8191/v1');
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [bypassMode, setBypassMode] = useState<BypassMode>('playwright');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const status: FlareSolverrStatus = await invokeFlaresolverr('runtime:flaresolverr-status');
      if (status) {
        setEnabled(status.enabled);
        if (status.url) setUrl(status.url);
        setAvailable(status.available);
      }
    } catch {
      // not critical — leave defaults
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void loadStatus();
  }, [isDesktop, loadStatus]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invokeFlaresolverr('runtime:flaresolverr-config', { enabled, url });
      toast.success(enabled ? 'FlareSolverr enabled and configured' : 'FlareSolverr disabled');
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save FlareSolverr settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const status: FlareSolverrStatus = await invokeFlaresolverr('runtime:flaresolverr-status');
      const isAvailable = status?.available ?? false;
      setAvailable(isAvailable);
      if (isAvailable) {
        toast.success('FlareSolverr is reachable and responding');
      } else {
        toast.error('FlareSolverr not reachable — ensure it is running at the configured URL');
      }
    } catch {
      setAvailable(false);
      toast.error('Could not connect to FlareSolverr');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isDesktop) return null;

  return (
    <div className="p-5 rounded-xl bg-muted/30 border border-white/5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-orange-500/15 p-2.5 text-orange-400 shrink-0 mt-0.5">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-base">FlareSolverr</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Use an external FlareSolverr instance to bypass Cloudflare-protected sources. Requires{' '}
            <button
              type="button"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              onClick={() =>
                (window as any).electron?.openExternal?.(
                  'https://github.com/FlareSolverr/FlareSolverr#installation',
                )
              }
            >
              FlareSolverr
            </button>{' '}
            to be running separately.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-background/50 border border-white/5">
        <div>
          <p className="font-medium text-sm">Enable FlareSolverr</p>
          <p className="text-xs text-muted-foreground mt-0.5">Route Cloudflare-blocked requests through FlareSolverr</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* URL config */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          FlareSolverr URL
        </label>
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8191/v1"
            className="font-mono text-sm bg-background/50 border-white/10"
            disabled={!enabled}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!enabled || isTesting}
            onClick={handleTest}
            className="shrink-0 gap-1.5"
          >
            {isTesting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : available === true ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : available === false ? (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Test
          </Button>
        </div>
        {available === true && (
          <p className="text-xs text-emerald-500 flex items-center gap-1.5 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Reachable at {url}
          </p>
        )}
        {available === false && (
          <p className="text-xs text-destructive flex items-center gap-1.5 mt-1">
            <XCircle className="w-3 h-3" /> Not reachable — ensure FlareSolverr is running
          </p>
        )}
      </div>

      {/* Bypass mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Bypass Mode
        </label>
        <div className="flex flex-wrap gap-2">
          {(['playwright', 'flaresolverr', 'embedded'] as BypassMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setBypassMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                bypassMode === mode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'
              }`}
            >
              {mode === 'playwright' ? 'Playwright (Default)' : mode === 'flaresolverr' ? 'External FlareSolverr' : 'Embedded'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {bypassMode === 'playwright'
            ? 'Uses the built-in Playwright browser to solve challenges — no external dependency.'
            : bypassMode === 'flaresolverr'
            ? 'Routes through your external FlareSolverr instance at the URL above.'
            : 'Uses the bundled embedded FlareSolverr (start it from the button in Developer Tools).'}
        </p>
      </div>

      {enabled && bypassMode === 'flaresolverr' && available === false && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">
            FlareSolverr is enabled but unreachable. Requests will fall back to Playwright. Start FlareSolverr
            and click Test to verify.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          Save
        </Button>
        <a
          href="https://github.com/FlareSolverr/FlareSolverr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Installation guide
        </a>
      </div>
    </div>
  );
}
