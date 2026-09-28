import { useState, useEffect } from 'react';
import { Key, ShieldCheck, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';
import { debridOrchestrator } from '@/core/providers/debrid-orchestrator';
import { RealDebridClient, DebridAccount } from '@/core/providers/realdebrid-client';
import { TorboxClient } from '@/core/providers/torbox-client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';

export function DebridSettingsPanel() {
  const [accounts, setAccounts] = useState<DebridAccount[]>([]);
  const [rdKey, setRdKey] = useState('');
  const [tbKey, setTbKey] = useState('');
  const [verifying, setVerifying] = useState<'realdebrid' | 'torbox' | null>(null);

  useEffect(() => {
    const saved = debridOrchestrator.getAccounts();
    setAccounts(saved);
    
    const rd = saved.find(a => a.provider === 'realdebrid');
    if (rd) setRdKey(rd.apiKey);
    
    const tb = saved.find(a => a.provider === 'torbox');
    if (tb) setTbKey(tb.apiKey);
  }, []);

  const handleVerify = async (provider: 'realdebrid' | 'torbox', key: string) => {
    if (!key.trim()) return;
    setVerifying(provider);
    
    let isActive = false;
    try {
      if (provider === 'realdebrid') {
        // Just verify by fetching user endpoint or similar. For RD, a bad token gives 401/403.
        const client = new RealDebridClient(key);
        // Simple test call that requires auth (we'll just call the user endpoint if it exists, or /torrents)
        await client.getTorrentInfo('invalid-id').catch(e => {
            if (e.message.includes('401') || e.message.includes('403')) throw e;
        });
        isActive = true;
      } else {
        const client = new TorboxClient(key);
        await client.getTorrentInfo('invalid-id').catch(e => {
            if (e.message.includes('401') || e.message.includes('403')) throw e;
        });
        isActive = true;
      }
    } catch (e) {
      isActive = false;
    }

    const updated = [...accounts];
    const existingIdx = updated.findIndex(a => a.provider === provider);
    if (existingIdx >= 0) {
      updated[existingIdx] = { provider, apiKey: key, isActive };
    } else {
      updated.push({ provider, apiKey: key, isActive });
    }

    setAccounts(updated);
    debridOrchestrator.saveAccounts(updated);
    setVerifying(null);
  };

  const getStatusIcon = (provider: string) => {
    const acc = accounts.find(a => a.provider === provider);
    if (!acc) return null;
    if (verifying === provider) return <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />;
    return acc.isActive ? <ShieldCheck className="w-4 h-4 text-success" /> : <ShieldAlert className="w-4 h-4 text-destructive" />;
  };

  return (
    <SettingsSection
      title="Premium Debrid Services"
      description="Link a Real-Debrid or TorBox account to directly stream premium cached torrents without relying on browser extensions or local client downloads."
      bodyClassName="space-y-4"
    >
      {/* Real-Debrid */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="w-32 text-sm font-semibold flex items-center gap-2">
          Real-Debrid
          {getStatusIcon('realdebrid')}
        </div>
        <Input
          type="password"
          placeholder="Real-Debrid API Token"
          value={rdKey}
          onChange={(e) => setRdKey(e.target.value)}
          className="flex-1 h-9"
        />
        <Button
          onClick={() => handleVerify('realdebrid', rdKey)}
          disabled={verifying === 'realdebrid' || !rdKey.trim()}
        >
          Verify & Save
        </Button>
      </div>

      {/* TorBox */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="w-32 text-sm font-semibold flex items-center gap-2">
          TorBox
          {getStatusIcon('torbox')}
        </div>
        <Input
          type="password"
          placeholder="TorBox API Token"
          value={tbKey}
          onChange={(e) => setTbKey(e.target.value)}
          className="flex-1 h-9"
        />
        <Button
          onClick={() => handleVerify('torbox', tbKey)}
          disabled={verifying === 'torbox' || !tbKey.trim()}
        >
          Verify & Save
        </Button>
      </div>

      <p className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-md border border-primary/10">
        API tokens are stored securely in your local browser cache. Torrents played via Debrid will bypass HTTP stream proxy limits and play at maximum network speed.
      </p>
    </SettingsSection>
  );
}
