import { useState } from 'react';
import {
  ShieldAlert,
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Info,
  Radio,
  Wifi,
  Lock,
  Globe,
  RadioTower,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useProxySettings,
  type CustomProxyEntry,
  type ProxyType,
  DEFAULT_ENV_PROXY_URL,
  DEFAULT_APP_PROXY_URL,
} from '@/hooks/user/useProxySettings';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SettingsSection, SettingRow, SettingsBadge } from '@/components/settings/SettingsPrimitives';

export function ProxySettingsPanel() {
  const {
    proxies,
    addProxy,
    removeProxy,
    toggleProxy,
    setDefaultProxy,
    resetToDefaults,
  } = useProxySettings();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state for adding new proxy
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState<ProxyType>('env');
  const [newPassword, setNewPassword] = useState('');

  const appProxies = proxies.filter((p) => p.type === 'app');
  const envProxies = proxies.filter((p) => p.type === 'env');

  const handleTestProxy = async (proxy: CustomProxyEntry) => {
    setTestingId(proxy.id);
    const toastId = toast.loading(`Probing ${proxy.name}...`);
    try {
      const url = new URL(proxy.url);
      const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      // Perform a ping check or status check
      const checkUrl = proxy.url.replace(/\/streamingProxy\/?$/, '/status');
      const res = await fetch(checkUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: proxy.password ? { 'x-proxy-auth': proxy.password } : undefined,
      }).catch(async () => {
        // Fallback probe direct HEAD/GET
        return fetch(proxy.url, { method: 'HEAD', signal: controller.signal });
      });
      clearTimeout(timeout);

      if (res && (res.ok || res.status === 400 || res.status === 403 || res.status === 404)) {
        toast.success(`Connected to ${proxy.name} successfully! (HTTP ${res.status})`, { id: toastId });
      } else {
        toast.warning(`Proxy reached but responded with status ${res?.status || 'unknown'}. Verify proxy credentials.`, { id: toastId });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error(`Connection to ${proxy.name} timed out after 6 seconds.`, { id: toastId });
      } else {
        toast.error(`Failed to reach ${proxy.name}: ${err.message || 'Connection refused'}`, { id: toastId });
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) {
      toast.error('Please specify a valid proxy URL');
      return;
    }

    try {
      new URL(newUrl.trim());
    } catch {
      toast.error('Invalid URL format. Include http:// or https://');
      return;
    }

    const created = addProxy({
      name: newName.trim() || (newType === 'app' ? 'Custom App Proxy' : 'Custom Remote Proxy'),
      url: newUrl.trim(),
      type: newType,
      password: newPassword.trim() || undefined,
      enabled: true,
      isDefault: false,
    });

    toast.success(`Added proxy "${created.name}"`);
    setIsAddOpen(false);
    setNewName('');
    setNewUrl('');
    setNewPassword('');
    setNewType('env');
  };

  return (
    <div className="space-y-6">
      {/* High Priority Warning Banner for Advanced Users */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 sm:p-5 text-foreground flex items-start gap-4 shadow-lg shadow-destructive/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/20 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-display font-bold text-sm text-destructive tracking-wide uppercase">
              Advanced Users Warning
            </h4>
            <SettingsBadge tone="danger">Expert Mode</SettingsBadge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            You need to know what you are doing. Custom streaming proxies alter how Tatakai fetches media,
            resolves video segments, and bypasses Cloudflare protections. Supplying an unresponsive or invalid
            proxy will break streaming playback.
          </p>
        </div>
      </div>

      {/* Host Your Own Proxy Info Box */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RadioTower className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              Want to host your own dedicated proxy?
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deploy your private Tatakai streaming proxy instance with Docker, Render, or Cloudflare Workers.
            </p>
          </div>
        </div>
        <a
          href="https://github.com/snozxyx/tatakai-proxy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 shrink-0"
        >
          <span>tatakai-proxy on GitHub</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Type 1: In-App Local Runtime Proxy */}
      <SettingsSection
        icon={Radio}
        eyebrow="Type 1 Proxy"
        title="App-Based Local Proxy"
        description="The local loopback proxy running directly in your app runtime to bypass host header restrictions and mint secure stream tokens."
        action={
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 text-xs font-bold border-white/10"
            onClick={() => {
              setNewType('app');
              setNewName('Secondary In-App Proxy');
              setNewUrl('http://127.0.0.1:8099');
              setIsAddOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Local Proxy
          </Button>
        }
      >
        <div className="space-y-3">
          {appProxies.map((proxy) => (
            <div
              key={proxy.id}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-background/50 transition-all',
                proxy.isDefault ? 'border-primary/40 shadow-sm' : 'border-white/10'
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{proxy.name}</span>
                  <SettingsBadge tone="primary">Type 1 · App</SettingsBadge>
                  {proxy.isDefault && (
                    <SettingsBadge tone="success">Active Runtime</SettingsBadge>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground truncate">{proxy.url}</p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  disabled={testingId === proxy.id}
                  onClick={() => handleTestProxy(proxy)}
                >
                  <Wifi className="h-3 w-3" />
                  {testingId === proxy.id ? 'Testing...' : 'Test'}
                </Button>

                {!proxy.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs font-semibold border-white/10"
                    onClick={() => setDefaultProxy(proxy.id)}
                  >
                    Set Active
                  </Button>
                )}

                <Switch
                  checked={proxy.enabled}
                  onCheckedChange={(checked) => toggleProxy(proxy.id, checked)}
                  aria-label={`Toggle ${proxy.name}`}
                />

                {proxies.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProxy(proxy.id)}
                    title="Remove proxy"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Type 2: Environment / Remote Streaming Proxies */}
      <SettingsSection
        icon={Globe}
        eyebrow="Type 2 Proxy"
        title="External & Environment Proxies"
        description="Remote streaming and Cloudflare-bypassing proxies. User-added proxies take precedence over the fallback .env values."
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 text-xs font-bold border-white/10"
              onClick={resetToDefaults}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Defaults
            </Button>
            <Button
              size="sm"
              className="rounded-xl gap-1.5 text-xs font-bold bg-primary text-primary-foreground"
              onClick={() => {
                setNewType('env');
                setNewName('Custom Remote Proxy');
                setNewUrl('');
                setIsAddOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Proxy
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {envProxies.map((proxy) => (
            <div
              key={proxy.id}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-background/50 transition-all',
                proxy.isDefault ? 'border-primary/40 shadow-sm' : 'border-white/10'
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{proxy.name}</span>
                  <SettingsBadge tone="muted">Type 2 · External</SettingsBadge>
                  {proxy.isDefault && (
                    <SettingsBadge tone="success">Primary Stream Proxy</SettingsBadge>
                  )}
                  {proxy.password && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      <Lock className="h-2.5 w-2.5" /> Auth Protected
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground truncate">{proxy.url}</p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  disabled={testingId === proxy.id}
                  onClick={() => handleTestProxy(proxy)}
                >
                  <Wifi className="h-3 w-3" />
                  {testingId === proxy.id ? 'Testing...' : 'Test'}
                </Button>

                {!proxy.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs font-semibold border-white/10"
                    onClick={() => setDefaultProxy(proxy.id)}
                  >
                    Set Primary
                  </Button>
                )}

                <Switch
                  checked={proxy.enabled}
                  onCheckedChange={(checked) => toggleProxy(proxy.id, checked)}
                  aria-label={`Toggle ${proxy.name}`}
                />

                {envProxies.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProxy(proxy.id)}
                    title="Remove proxy"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* Add New Proxy Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 border-white/10 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-lg">Add Custom Streaming Proxy</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure a personal streaming or app proxy. The URL will be checked and prioritized for video playback.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Proxy Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewType('env')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold transition-all text-center',
                    newType === 'env'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-white/10 bg-background/50 text-muted-foreground hover:border-white/20'
                  )}
                >
                  Type 2: External / Remote
                </button>
                <button
                  type="button"
                  onClick={() => setNewType('app')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold transition-all text-center',
                    newType === 'app'
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-white/10 bg-background/50 text-muted-foreground hover:border-white/20'
                  )}
                >
                  Type 1: App Local Host
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Friendly Name
              </label>
              <Input
                placeholder="e.g. My Frankfurt VPS Node"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 rounded-xl bg-background/60 border-white/10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Proxy Endpoint URL
              </label>
              <Input
                placeholder={newType === 'app' ? 'http://127.0.0.1:8099' : 'https://proxy.example.com/api/v1/streamingProxy'}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                required
                className="h-10 rounded-xl bg-background/60 border-white/10 text-sm font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Proxy Secret / Password (Optional)
              </label>
              <Input
                type="password"
                placeholder="Shared secret if protected"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 rounded-xl bg-background/60 border-white/10 text-sm font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="rounded-xl text-xs font-bold bg-primary text-primary-foreground"
              >
                Add Proxy
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
