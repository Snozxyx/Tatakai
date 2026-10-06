import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, EyeOff } from 'lucide-react';
import { debridOrchestrator } from '@/core/providers/debrid-orchestrator';
import { RealDebridClient, DebridAccount } from '@/core/providers/realdebrid-client';
import { TorboxClient } from '@/core/providers/torbox-client';
import { useP2PDisabled } from '@/lib/torrent/p2pPolicy';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';

export function DebridSettingsPanel() {
  const [accounts, setAccounts] = useState<DebridAccount[]>([]);
  const [rdKey, setRdKey] = useState('');
  const [tbKey, setTbKey] = useState('');
  const [verifying, setVerifying] = useState<'realdebrid' | 'torbox' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [p2pDisabled, setP2PDisabled] = useP2PDisabled();
  const hasActiveDebrid = accounts.some((a) => a.isActive);

  useEffect(() => {
    const saved = debridOrchestrator.getAccounts();
    setAccounts(saved);
    
    const rd = saved.find(a => a.provider === 'realdebrid');
    if (rd) setRdKey(rd.apiKey);
    
    const tb = saved.find(a => a.provider === 'torbox');
    if (tb) setTbKey(tb.apiKey);
  }, []);

  const handleVerify = async (provider: 'realdebrid' | 'torbox', key: string) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return;
    setVerifying(provider);
    setMessage(null);

    try {
      if (provider === 'realdebrid') {
        await new RealDebridClient(normalizedKey).verifyToken();
      } else {
        await new TorboxClient(normalizedKey).verifyToken();
      }

      // Exactly one provider is active. Previously both could stay active while
      // the orchestrator silently preferred Real-Debrid, making a valid TorBox
      // setup look broken.
      const updated = debridOrchestrator.getAccounts()
        .filter((account) => account.provider !== provider)
        .map((account) => ({ ...account, isActive: false }));
      updated.push({ provider, apiKey: normalizedKey, isActive: true });
      setAccounts(updated);
      debridOrchestrator.saveAccounts(updated, provider);
      setMessage(`${provider === 'torbox' ? 'TorBox' : 'Real-Debrid'} verified and selected.`);
    } catch (error: any) {
      setMessage(error?.message || `Could not verify ${provider === 'torbox' ? 'TorBox' : 'Real-Debrid'}.`);
    } finally {
      setVerifying(null);
    }
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
          autoComplete="off"
          spellCheck={false}
          className="flex-1 h-9"
        />
        <Button
          onClick={() => handleVerify('realdebrid', rdKey)}
          disabled={verifying !== null || !rdKey.trim()}
        >
          Verify & Use
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
          autoComplete="off"
          spellCheck={false}
          className="flex-1 h-9"
        />
        <Button
          onClick={() => handleVerify('torbox', tbKey)}
          disabled={verifying !== null || !tbKey.trim()}
        >
          Verify & Use
        </Button>
      </div>

      <p className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-md border border-primary/10">
        Tokens stay on this device and are never synced to your Tatakai account. The selected service is used for torrent releases without joining a peer-to-peer swarm.
      </p>

      {/* P2P kill-switch — hard guarantee, not a preference hint */}
      <div className="flex items-start sm:items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-start gap-2.5">
          <EyeOff className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Disable P2P torrents</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Never join a peer-to-peer swarm. Torrent streaming, torrent downloads, and magnet
              imports are blocked app-wide.
              {p2pDisabled
                ? hasActiveDebrid
                  ? ' Your debrid service keeps working — releases resolve server-side.'
                  : ' Without a debrid service above, torrent releases will not play at all.'
                : ''}
            </p>
          </div>
        </div>
        <Switch checked={p2pDisabled} onCheckedChange={setP2PDisabled} aria-label="Disable P2P torrents" />
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </SettingsSection>
  );
}
