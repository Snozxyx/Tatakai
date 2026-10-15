import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
        toast.success(uiI18n.t('app.connected_to_i18n_value_0_successfully_http_i18n_217dcea0', { value0: proxy.name, value1: res.status }), { id: toastId });
      } else {
        toast.warning(uiI18n.t('app.proxy_reached_but_responded_with_status_i18n_val_5196a022', { value0: res?.status || 'unknown' }), { id: toastId });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error(uiI18n.t('app.connection_to_i18n_value_0_timed_out_after_6_sec_1061fc0f', { value0: proxy.name }), { id: toastId });
      } else {
        toast.error(uiI18n.t('app.failed_to_reach_i18n_value_0_i18n_value_1_1c6e4668', { value0: proxy.name, value1: err.message || 'Connection refused' }), { id: toastId });
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) {
      toast.error(uiI18n.t('app.please_specify_a_valid_proxy_url_b0c374ce'));
      return;
    }

    try {
      new URL(newUrl.trim());
    } catch {
      toast.error(uiI18n.t('app.invalid_url_format_include_http_or_https_49891ae9'));
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

    toast.success(uiI18n.t('app.added_proxy_i18n_value_0_a5a89694', { value0: created.name }));
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
              {uiI18n.t('app.advanced_users_warning_9e47521c')}
            </h4>
            <SettingsBadge tone="danger">{uiI18n.t('app.expert_mode_e20bdc89')}</SettingsBadge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {uiI18n.t('app.you_need_to_know_what_you_are_doing_custom_strea_3d7b8f0a')}
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
              {uiI18n.t('app.want_to_host_your_own_dedicated_proxy_d68b8cea')}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {uiI18n.t('app.deploy_your_private_tatakai_streaming_proxy_inst_e7ec1f71')}
            </p>
          </div>
        </div>
        <a
          href="https://github.com/snozxyx/tatakai-proxy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20 shrink-0"
        >
          <span>{uiI18n.t('app.tatakai_proxy_on_github_acd54bb0')}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Type 1: In-App Local Runtime Proxy */}
      <SettingsSection
        icon={Radio}
        eyebrow="Type 1 Proxy"
        title={uiI18n.t('app.app_based_local_proxy_504c20c4')}
        description={uiI18n.t('app.the_local_loopback_proxy_running_directly_in_you_2fda517f')}
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
            {uiI18n.t('app.add_local_proxy_24227985')}
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
                  <SettingsBadge tone="primary">{uiI18n.t('app.type_1_app_2336e7c4')}</SettingsBadge>
                  {proxy.isDefault && (
                    <SettingsBadge tone="success">{uiI18n.t('app.active_runtime_b2031ae9')}</SettingsBadge>
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
                  {testingId === proxy.id ? 'Testing...' : uiI18n.t('app.test_640ab2ba')}
                </Button>

                {!proxy.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs font-semibold border-white/10"
                    onClick={() => setDefaultProxy(proxy.id)}
                  >
                    {uiI18n.t('app.set_active_758d7f72')}
                  </Button>
                )}

                <Switch
                  checked={proxy.enabled}
                  onCheckedChange={(checked) => toggleProxy(proxy.id, checked)}
                  aria-label={uiI18n.t('app.toggle_i18n_value_0_8b9bc075', { value0: proxy.name })}
                />

                {proxies.length > 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProxy(proxy.id)}
                    title={uiI18n.t('app.remove_proxy_a5f80012')}
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
        title={uiI18n.t('app.external_environment_proxies_6bf8d85b')}
        description={uiI18n.t('app.remote_streaming_and_cloudflare_bypassing_proxie_6c159769')}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1.5 text-xs font-bold border-white/10"
              onClick={resetToDefaults}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {uiI18n.t('app.reset_defaults_4f97ffa9')}
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
              {uiI18n.t('app.add_proxy_8afe820b')}
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
                  <SettingsBadge tone="muted">{uiI18n.t('app.type_2_external_499e6937')}</SettingsBadge>
                  {proxy.isDefault && (
                    <SettingsBadge tone="success">{uiI18n.t('app.primary_stream_proxy_055219cd')}</SettingsBadge>
                  )}
                  {proxy.password && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      <Lock className="h-2.5 w-2.5" /> {uiI18n.t('app.auth_protected_d1e97b85')}
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
                  {testingId === proxy.id ? 'Testing...' : uiI18n.t('app.test_640ab2ba')}
                </Button>

                {!proxy.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5 text-xs font-semibold border-white/10"
                    onClick={() => setDefaultProxy(proxy.id)}
                  >
                    {uiI18n.t('app.set_primary_6f286973')}
                  </Button>
                )}

                <Switch
                  checked={proxy.enabled}
                  onCheckedChange={(checked) => toggleProxy(proxy.id, checked)}
                  aria-label={uiI18n.t('app.toggle_i18n_value_0_8b9bc075', { value0: proxy.name })}
                />

                {envProxies.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProxy(proxy.id)}
                    title={uiI18n.t('app.remove_proxy_a5f80012')}
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
            <DialogTitle className="font-display font-bold text-lg">{uiI18n.t('app.add_custom_streaming_proxy_e80ef48b')}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {uiI18n.t('app.configure_a_personal_streaming_or_app_proxy_the__cc5e7897')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {uiI18n.t('app.proxy_type_c97f01e6')}
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
                  {uiI18n.t('app.type_2_external_remote_31c436e5')}
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
                  {uiI18n.t('app.type_1_app_local_host_dc6f4fd4')}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {uiI18n.t('app.friendly_name_e2e83686')}
              </label>
              <Input
                placeholder={uiI18n.t('app.e_g_my_frankfurt_vps_node_aaf47565')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 rounded-xl bg-background/60 border-white/10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {uiI18n.t('app.proxy_endpoint_url_552e1bfb')}
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
                {uiI18n.t('app.proxy_secret_password_optional_b74a8b2a')}
              </label>
              <Input
                type="password"
                placeholder={uiI18n.t('app.shared_secret_if_protected_6292e5ce')}
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
                {uiI18n.t('app.cancel_77dfd213')}
              </Button>
              <Button
                type="submit"
                className="rounded-xl text-xs font-bold bg-primary text-primary-foreground"
              >
                {uiI18n.t('app.add_proxy_8afe820b')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
