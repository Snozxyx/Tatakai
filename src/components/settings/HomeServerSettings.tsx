import { useEffect, useState, useCallback } from 'react';
import { Server, Play, Square, Copy, Users, Shield, Share2, Check, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

type HomeStatus = {
  running?: boolean;
  port?: number;
  bindMode?: string;
  urls?: string[];
  lanAddresses?: string[];
  passwordConfigured?: boolean;
  remoteEnabled?: boolean;
  remoteBaseUrl?: string | null;
  shareCatalog?: boolean;
  requireConsent?: boolean;
  clients?: Array<{ userId?: string; ip?: string; lastSeenAt?: number }>;
};

type ConsentRequest = {
  id: string;
  userId: string;
  label?: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
};

/** Resolve Home Server API from electron or tatakaiRuntime (handles stale preload). */
function getHomeServerApi() {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  if (!w) return null;
  const electron = w.electron;
  const runtime = w.tatakaiRuntime;
  const invoke = electron?.invoke || runtime?.invoke;

  const call = (camel: string, channel: string, nested?: string) => {
    return async (...args: unknown[]) => {
      if (electron?.[camel] && typeof electron[camel] === 'function') {
        return electron[camel](...args);
      }
      if (nested && electron?.homeServer?.[nested] && typeof electron.homeServer[nested] === 'function') {
        return electron.homeServer[nested](...args);
      }
      if (runtime?.[camel] && typeof runtime[camel] === 'function') {
        return runtime[camel](...args);
      }
      if (nested && runtime?.homeServer?.[nested] && typeof runtime.homeServer[nested] === 'function') {
        return runtime.homeServer[nested](...args);
      }
      if (typeof invoke === 'function') {
        return invoke(channel, ...args);
      }
      throw new Error(
        `${camel} is unavailable. Restart the Tatakai desktop app to load the updated preload bridge.`,
      );
    };
  };

  return {
    getStatus: call('homeServerGetStatus', 'home-server:get-status', 'getStatus'),
    getConfig: call('homeServerGetConfig', 'home-server:get-config', 'getConfig'),
    setConfig: call('homeServerSetConfig', 'home-server:set-config', 'setConfig'),
    start: call('homeServerStart', 'home-server:start', 'start'),
    stop: call('homeServerStop', 'home-server:stop', 'stop'),
    createToken: call('homeServerCreateToken', 'home-server:create-token', 'createToken'),
    upsertUser: call('homeServerUpsertUser', 'home-server:upsert-user', 'upsertUser'),
    listConsent: call('homeServerListConsent', 'home-server:list-consent', 'listConsent'),
    decideConsent: call('homeServerDecideConsent', 'home-server:decide-consent', 'decideConsent'),
    onStatus: electron?.onHomeServerStatus || runtime?.onHomeServerStatus,
  };
}

export function HomeServerSettings() {
  const isDesktop = useIsDesktopApp();
  const [status, setStatus] = useState<HomeStatus>({});
  const [port, setPort] = useState(8787);
  const [bindMode, setBindMode] = useState<'localhost' | 'lan' | 'all'>('lan');
  const [password, setPassword] = useState('');
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteBaseUrl, setRemoteBaseUrl] = useState('');
  const [shareCatalog, setShareCatalog] = useState(true);
  const [requireConsent, setRequireConsent] = useState(true);
  const [viewerName, setViewerName] = useState('viewer');
  const [viewerPassword, setViewerPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [deviceToken, setDeviceToken] = useState('');
  const [consentRequests, setConsentRequests] = useState<ConsentRequest[]>([]);

  const refresh = useCallback(async () => {
    const api = getHomeServerApi();
    if (!api) return;
    const [nextStatus, config, consent] = await Promise.all([
      api.getStatus(),
      api.getConfig(),
      api.listConsent().catch(() => ({ requests: [] })),
    ]);
    setStatus(nextStatus || {});
    if (config?.port) setPort(config.port);
    if (config?.bindMode) setBindMode(config.bindMode);
    if (typeof config?.remoteEnabled === 'boolean') setRemoteEnabled(config.remoteEnabled);
    if (config?.remoteBaseUrl) setRemoteBaseUrl(config.remoteBaseUrl);
    if (typeof config?.shareCatalog === 'boolean') setShareCatalog(config.shareCatalog);
    if (typeof config?.requireConsent === 'boolean') setRequireConsent(config.requireConsent);
    setConsentRequests(Array.isArray(consent?.requests) ? consent.requests : []);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void refresh();
    const api = getHomeServerApi();
    const unsub = api?.onStatus?.((data: HomeStatus) => setStatus(data));
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => {
      unsub?.();
      window.clearInterval(timer);
    };
  }, [isDesktop, refresh]);

  if (!isDesktop) return null;

  const saveConfig = async () => {
    setBusy(true);
    try {
      const api = getHomeServerApi();
      if (!api) throw new Error('Home Server bridge missing — restart the app');
      await api.setConfig({
        port,
        bindMode,
        remoteEnabled,
        remoteBaseUrl,
        shareCatalog,
        requireConsent,
        password: password || undefined,
      });
      setPassword('');
      toast.success('Home Server settings saved');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const api = getHomeServerApi();
      if (!api) throw new Error('Home Server bridge missing — restart the app');
      await api.setConfig({
        port,
        bindMode,
        remoteEnabled,
        remoteBaseUrl,
        shareCatalog,
        requireConsent,
        password: password || undefined,
      });
      const res = await api.start({ port, bindMode });
      if (res && res.success === false) throw new Error(res.error || 'Start failed');
      toast.success('Home Server started');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Start failed');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const api = getHomeServerApi();
      await api?.stop();
      toast.success('Home Server stopped');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stop failed');
    } finally {
      setBusy(false);
    }
  };

  const createToken = async () => {
    const api = getHomeServerApi();
    const res = await api?.createToken({ userId: 'admin', label: 'phone' });
    if (res?.token) {
      setDeviceToken(res.token);
      toast.success('Device token created');
    }
  };

  const upsertViewer = async () => {
    const api = getHomeServerApi();
    const res = await api?.upsertUser({
      id: viewerName || 'viewer',
      name: viewerName || 'Viewer',
      role: 'viewer',
      permissions: ['library', 'streams', 'downloads', 'catalog'],
      password: viewerPassword || undefined,
    });
    if (res?.success) {
      toast.success('Household user saved');
      setViewerPassword('');
    } else {
      toast.error(res?.error || 'Failed to save user');
    }
  };

  const decideConsent = async (id: string, approve: boolean) => {
    const api = getHomeServerApi();
    await api?.decideConsent({ id, approve });
    toast.success(approve ? 'Access approved' : 'Access denied');
    await refresh();
  };

  const primaryUrl = status.urls?.[0] || `http://127.0.0.1:${port}`;

  return (
    <GlassPanel className="p-4 rounded-xl bg-muted/30 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/15 p-3 text-primary">
          <Server className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Tatakai Home Server</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Share your download catalog so household devices can browse and watch — with optional consent approval.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            status.running ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-muted-foreground'
          }`}
        >
          {status.running ? 'Running' : 'Stopped'}
        </span>
        {status.running ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={stop} className="gap-2">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={start} className="gap-2">
            <Play className="h-3.5 w-3.5" />
            Start server
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={saveConfig}>
          Save settings
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-semibold">Port</span>
          <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 8787)} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-semibold">Bind mode</span>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={bindMode}
            onChange={(e) => setBindMode(e.target.value as 'localhost' | 'lan' | 'all')}
          >
            <option value="localhost">Localhost only</option>
            <option value="lan">LAN (recommended)</option>
            <option value="all">All interfaces (explicit)</option>
          </select>
        </label>
        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" /> Admin password
          </span>
          <Input
            type="password"
            placeholder={status.passwordConfigured ? '•••••••• (leave blank to keep)' : 'Set a password before sharing'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Share2 className="h-4 w-4 mt-0.5 text-primary" />
            <div>
              <div className="text-sm font-semibold">Share download catalog</div>
              <p className="text-xs text-muted-foreground mt-1">
                Other authenticated users can list your offline library and stream episodes.
              </p>
            </div>
          </div>
          <Switch checked={shareCatalog} onCheckedChange={setShareCatalog} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Require host consent</div>
            <p className="text-xs text-muted-foreground mt-1">
              Viewers must request access; you approve before they can watch.
            </p>
          </div>
          <Switch checked={requireConsent} onCheckedChange={setRequireConsent} disabled={!shareCatalog} />
        </div>
      </div>

      {consentRequests.filter((r) => r.status === 'pending').length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="text-sm font-semibold">Pending consent requests</div>
          {consentRequests
            .filter((r) => r.status === 'pending')
            .map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{req.userId}</div>
                  <div className="text-xs text-muted-foreground">{req.label || 'device'} · {new Date(req.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => decideConsent(req.id, true)}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => decideConsent(req.id, false)}>
                    <X className="h-3.5 w-3.5" /> Deny
                  </Button>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <div className="text-sm font-semibold">Connect from phone, TV, or browser</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-black/30 px-2 py-1">{primaryUrl}</code>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              void navigator.clipboard.writeText(primaryUrl);
              toast.success('URL copied');
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1"
            disabled={!status.running}
            onClick={() => window.open(primaryUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Home UI
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Opens the Tatakai-branded web app at that URL — browse your download library and stream episodes.
          Enable <strong>Share download catalog</strong> above so remote devices can watch.
        </p>
        <Button size="sm" variant="secondary" onClick={createToken}>
          Create device token
        </Button>
        {deviceToken ? (
          <code className="block text-xs break-all rounded bg-black/30 p-2">{deviceToken}</code>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Remote access</div>
            <p className="text-xs text-muted-foreground mt-1">
              Enable only behind a reverse proxy (Caddy/nginx) with TLS.
            </p>
          </div>
          <Switch checked={remoteEnabled} onCheckedChange={setRemoteEnabled} />
        </div>
        <Input
          placeholder="https://home.example.com"
          value={remoteBaseUrl}
          disabled={!remoteEnabled}
          onChange={(e) => setRemoteBaseUrl(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" />
          Household user (viewer)
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="Username" value={viewerName} onChange={(e) => setViewerName(e.target.value)} />
          <Input
            type="password"
            placeholder="Password"
            value={viewerPassword}
            onChange={(e) => setViewerPassword(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={upsertViewer}>
          Save viewer
        </Button>
      </div>
    </GlassPanel>
  );
}
