import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWatchRoomContext } from './WatchRoomContext';

/** Credentials are intentionally never pre-filled or persisted in browser storage. */
export function P2PRoomControls({ settings = false }: { settings?: boolean }) {
  const { p2p, isHost, user, room } = useWatchRoomContext();
  const [urls, setUrls] = useState('');
  const [username, setUsername] = useState('');
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (enable: boolean, policy = p2p.state?.buffering_policy || 'pause-together', replaceTurn = false) => {
    setBusy(true); setError('');
    try {
      const turnServers = replaceTurn
        ? (urls.trim() ? [{ urls: urls.split(',').map(value => value.trim()).filter(Boolean), username, credential }] : [])
        : p2p.state?.turn_servers || [];
      await p2p.configure({ enabled: enable, bufferingPolicy: policy, turnServers });
      setCredential(''); setUsername(''); setUrls('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save room settings.'); }
    finally { setBusy(false); }
  };
  if (settings) {
    if (!isHost || (!p2p.rolloutAvailable && !p2p.enabled)) return null;
    return <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-label="Peer playback settings">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Peer playback · preview</h3>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(!p2p.enabled)}>
          {p2p.enabled ? 'Use legacy playback' : 'Enable P2P'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Shared-source playback with a direct connection to the host when needed. Up to 20 people, subject to host upload capacity.</p>
      {p2p.enabled && <>
        <label className="block text-xs space-y-1">When someone buffers
          <select className="block w-full rounded-md border bg-background p-2" disabled={busy}
            value={p2p.state?.buffering_policy || 'pause-together'}
            onChange={event => void save(true, event.target.value as 'pause-together' | 'keep-playing')}>
            <option value="pause-together">Pause together</option><option value="keep-playing">Keep playing</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">Some networks need a TURN relay. Supply your own credentials; they are shared only with room members. Saving empty URLs removes the relay.</p>
        <label className="block text-xs space-y-1">TURN URLs, separated by commas
          <Input value={urls} onChange={event => setUrls(event.target.value)} placeholder="turn:relay.example:3478" autoComplete="off" />
        </label>
        <label className="block text-xs space-y-1">TURN username
          <Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" />
        </label>
        <label className="block text-xs space-y-1">TURN credential
          <Input type="password" value={credential} onChange={event => setCredential(event.target.value)} autoComplete="new-password" />
        </label>
        <Button size="sm" disabled={busy} onClick={() => void save(true, undefined, true)}>Save relay settings</Button>
      </>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>;
  }
  if (!p2p.enabled) return null;
  const staleHost = p2p.state?.host_seen_at && Date.now() - Date.parse(p2p.state.host_seen_at) > 30000;
  return <div className="flex flex-wrap items-center gap-2 text-xs" role="status" aria-live="polite">
    <span>{p2p.status === 'synchronized' ? `Timeline drift · ${Math.round(p2p.drift * 1000)} ms` : p2p.status.replace(/-/g, ' ')}</span>
    {p2p.message && <span className="text-muted-foreground">{p2p.message}</span>}
    {(p2p.status === 'failed' || p2p.message) && <Button size="sm" variant="outline" onClick={p2p.retry}>Retry connection</Button>}
    {!isHost && staleHost && user && <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await p2p.transfer(user.id, true); } catch { setError('Takeover needs an accessible source. Ask the host to return or create a new room with the same episode.'); }
      finally { setBusy(false); }
    }}>Take over room</Button>}
    {isHost && <span className="text-muted-foreground">{room.max_participants} people maximum</span>}
    {error && <span role="alert" className="text-destructive">{error}</span>}
  </div>;
}
