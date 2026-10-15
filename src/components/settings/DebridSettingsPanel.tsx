import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { CloudDebridClient } from '@/core/providers/cloud-debrid-client';
import { debridOrchestrator } from '@/core/providers/debrid-orchestrator';
import { RealDebridClient, DEBRID_PROVIDERS, type DebridAccount, type DebridProvider } from '@/core/providers/realdebrid-client';
import { TorboxClient } from '@/core/providers/torbox-client';
import { useP2PDisabled } from '@/lib/torrent/p2pPolicy';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsPrimitives';

const PROVIDERS: DebridProvider[] = ['realdebrid', 'torbox', 'alldebrid', 'premiumize'];
export function DebridSettingsPanel() {
  useUiTranslation();
  const [accounts, setAccounts] = useState<DebridAccount[]>([]);
  const [keys, setKeys] = useState<Record<DebridProvider, string>>({ realdebrid: '', torbox: '', alldebrid: '', premiumize: '' });
  const [verifying, setVerifying] = useState<DebridProvider>();
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [p2pDisabled, setP2PDisabled] = useP2PDisabled();
  useEffect(() => {
    const saved = debridOrchestrator.getAccounts();
    setAccounts(saved);
    setKeys(current => ({ ...current, ...Object.fromEntries(saved.map(account => [account.provider, account.apiKey])) }));
  }, []);
  const verify = async (provider: DebridProvider) => {
    const key = keys[provider].trim(); if (!key) return;
    setVerifying(provider); setMessage(undefined);
    try {
      if (provider === 'realdebrid') await new RealDebridClient(key).verifyToken();
      else if (provider === 'torbox') await new TorboxClient(key).verifyToken();
      else await new CloudDebridClient(provider, key).verifyToken();
      const updated = debridOrchestrator.getAccounts().filter(account => account.provider !== provider).map(account => ({ ...account, isActive: false }));
      updated.push({ provider, apiKey: key, isActive: true });
      debridOrchestrator.saveAccounts(updated, provider); setAccounts(updated);
      setMessage({ get text() { return uiI18n.t('app.i18n_value_0_verified_and_selected_2bc30676', { value0: DEBRID_PROVIDERS[provider] }); } });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Could not verify this account. Check your API key and try again.', error: true }); }
    finally { setVerifying(undefined); }
  };
  return <SettingsSection title={uiI18n.t('app.debrid_services_931317ec')} description={uiI18n.t('app.stream_cached_torrent_releases_over_http_with_yo_bb90c104')} bodyClassName="space-y-4">
    <p className="text-xs leading-relaxed text-muted-foreground">{uiI18n.t('app.api_keys_stay_on_this_device_select_one_service__676d3fa0')}</p>
    <div className="divide-y divide-border border-y border-border">
      {PROVIDERS.map(provider => {
        const account = accounts.find(item => item.provider === provider);
        return <div key={provider} className="space-y-2.5 py-4">
          <div className="flex items-center gap-3"><label htmlFor={`debrid-key-${provider}`} className="flex-1 text-sm font-semibold">{DEBRID_PROVIDERS[provider]}</label>
            {account && <span className={`flex items-center gap-1 text-xs ${account.isActive ? 'text-primary' : 'text-muted-foreground'}`}>{account.isActive && <Check className="h-3.5 w-3.5" />}{account.isActive ? uiI18n.t('app.selected_9a976fc2') : uiI18n.t('app.saved_c0ae8f6e')}</span>}
            {account && <Button size="icon" variant="ghost" aria-label={uiI18n.t('app.remove_i18n_value_0_account_1557932c', { value0: DEBRID_PROVIDERS[provider] })} disabled={!!verifying} onClick={() => {
              const remaining = debridOrchestrator.getAccounts().filter(item => item.provider !== provider);
              debridOrchestrator.saveAccounts(remaining); setAccounts(remaining); setKeys(current => ({ ...current, [provider]: '' })); setMessage({ get text() { return uiI18n.t('app.i18n_value_0_removed_from_this_device_afbd2320', { value0: DEBRID_PROVIDERS[provider] }); } });
            }}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input id={`debrid-key-${provider}`} type="password" aria-label={uiI18n.t('app.i18n_value_0_api_key_97adb29e', { value0: DEBRID_PROVIDERS[provider] })} placeholder={uiI18n.t('app.api_key_cf678cab')} value={keys[provider]} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-48" onChange={event => setKeys(current => ({ ...current, [provider]: event.target.value }))} />
            <Button variant={account?.isActive ? 'outline' : 'default'} disabled={!!verifying || !keys[provider].trim()} onClick={() => void verify(provider)}>{verifying === provider ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : uiI18n.t('app.verify_use_441f09d6')}</Button>
          </div>
        </div>;
      })}
    </div>
    {message && <p role={message.error ? 'alert' : 'status'} className={`break-words text-sm ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title={uiI18n.t('app.disable_p2p_torrents_3324c168')} description={uiI18n.t('app.block_torrent_streaming_torrent_downloads_and_ma_f047b0fa', { value0: p2pDisabled && !accounts.some(account => account.isActive) ? ' Select a debrid account above to play torrent releases.' : '' })} control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={p2pDisabled} onCheckedChange={setP2PDisabled} />} />
  </SettingsSection>;
}
