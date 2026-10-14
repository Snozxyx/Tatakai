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
      setMessage({ text: `${DEBRID_PROVIDERS[provider]} verified and selected.` });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Could not verify this account. Check your API key and try again.', error: true }); }
    finally { setVerifying(undefined); }
  };
  return <SettingsSection title="Debrid services" description="Stream cached torrent releases over HTTP with your preferred provider." bodyClassName="space-y-4">
    <p className="text-xs leading-relaxed text-muted-foreground">API keys stay on this device. Select one service for playback; your other accounts remain saved.</p>
    <div className="divide-y divide-border border-y border-border">
      {PROVIDERS.map(provider => {
        const account = accounts.find(item => item.provider === provider);
        return <div key={provider} className="space-y-2.5 py-4">
          <div className="flex items-center gap-3"><label htmlFor={`debrid-key-${provider}`} className="flex-1 text-sm font-semibold">{DEBRID_PROVIDERS[provider]}</label>
            {account && <span className={`flex items-center gap-1 text-xs ${account.isActive ? 'text-primary' : 'text-muted-foreground'}`}>{account.isActive && <Check className="h-3.5 w-3.5" />}{account.isActive ? 'Selected' : 'Saved'}</span>}
            {account && <Button size="icon" variant="ghost" aria-label={`Remove ${DEBRID_PROVIDERS[provider]} account`} disabled={!!verifying} onClick={() => {
              const remaining = debridOrchestrator.getAccounts().filter(item => item.provider !== provider);
              debridOrchestrator.saveAccounts(remaining); setAccounts(remaining); setKeys(current => ({ ...current, [provider]: '' })); setMessage({ text: `${DEBRID_PROVIDERS[provider]} removed from this device.` });
            }}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input id={`debrid-key-${provider}`} type="password" aria-label={`${DEBRID_PROVIDERS[provider]} API key`} placeholder="API key" value={keys[provider]} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 basis-48" onChange={event => setKeys(current => ({ ...current, [provider]: event.target.value }))} />
            <Button variant={account?.isActive ? 'outline' : 'default'} disabled={!!verifying || !keys[provider].trim()} onClick={() => void verify(provider)}>{verifying === provider ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify & use'}</Button>
          </div>
        </div>;
      })}
    </div>
    {message && <p role={message.error ? 'alert' : 'status'} className={`break-words text-sm ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    <SettingRow className="[&_.settings-row-main]:flex-nowrap [&_.settings-row-label]:min-w-0" title="Disable P2P torrents" description={`Block torrent streaming, torrent downloads, and magnet imports. Debrid HTTP playback remains available.${p2pDisabled && !accounts.some(account => account.isActive) ? ' Select a debrid account above to play torrent releases.' : ''}`} control={({ labelId, descriptionId }) => <Switch aria-labelledby={labelId} aria-describedby={descriptionId} checked={p2pDisabled} onCheckedChange={setP2PDisabled} />} />
  </SettingsSection>;
}
