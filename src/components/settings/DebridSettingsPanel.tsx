import { useState, useEffect } from 'react';
import { Key, ShieldCheck, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';
import { debridOrchestrator } from '@/core/providers/debrid-orchestrator';
import { RealDebridClient, DebridAccount } from '@/core/providers/realdebrid-client';
import { TorboxClient } from '@/core/providers/torbox-client';

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
    return acc.isActive ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <ShieldAlert className="w-4 h-4 text-destructive" />;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium flex items-center gap-2">
          <Key className="w-4 h-4" />
          Premium Debrid Services
        </p>
        <p className="text-sm text-muted-foreground">
          Link a Real-Debrid or TorBox account to directly stream premium cached torrents without relying on browser extensions or local client downloads.
        </p>
      </div>

      <div className="space-y-4">
        {/* Real-Debrid */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="w-32 text-sm font-semibold flex items-center gap-2">
            Real-Debrid
            {getStatusIcon('realdebrid')}
          </div>
          <input
            type="password"
            placeholder="Real-Debrid API Token"
            value={rdKey}
            onChange={(e) => setRdKey(e.target.value)}
            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={() => handleVerify('realdebrid', rdKey)}
            disabled={verifying === 'realdebrid' || !rdKey.trim()}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
          >
            Verify & Save
          </button>
        </div>

        {/* TorBox */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="w-32 text-sm font-semibold flex items-center gap-2">
            TorBox
            {getStatusIcon('torbox')}
          </div>
          <input
            type="password"
            placeholder="TorBox API Token"
            value={tbKey}
            onChange={(e) => setTbKey(e.target.value)}
            className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={() => handleVerify('torbox', tbKey)}
            disabled={verifying === 'torbox' || !tbKey.trim()}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
          >
            Verify & Save
          </button>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-md border border-primary/10">
        API tokens are stored securely in your local browser cache. Torrents played via Debrid will bypass HTTP stream proxy limits and play at maximum network speed.
      </p>
    </div>
  );
}
