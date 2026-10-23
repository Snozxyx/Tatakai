import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSection } from './SettingsPrimitives';
import { connectServer, listServers, saveServers, serverRequest } from '@/core/extensions/server/client';

export function ExtensionServersSettings({ initialUrl = '', pairingCode = '' }: { initialUrl?: string; pairingCode?: string }) {
  const [servers, setServers] = useState(listServers), [url, setUrl] = useState(initialUrl), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function run(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); setServers(listServers()); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not connect'); } finally { setBusy(false); } }
  return <SettingsSection title="Extension Servers" description="Connect your own servers and use their sources alongside local extensions.">
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { const server = await connectServer(url, password, pairingCode || undefined); setPassword(''); setMessage(`Connected to ${server.name}`); }); }}>
        <div className="flex flex-col gap-2"><Label htmlFor="extension-server-url">Server URL</Label><Input id="extension-server-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://your-server.example" required /></div>
        {!pairingCode && <div className="flex flex-col gap-2"><Label htmlFor="extension-server-password">Viewer access password (optional for public servers)</Label><Input id="extension-server-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></div>}
        <Button className="self-start" disabled={busy}>{busy ? 'Connecting…' : pairingCode ? 'Pair this device' : 'Connect / reconnect'}</Button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
      {!servers.length && <p className="text-sm text-muted-foreground">No connected servers. Deploy Tatakai Server, install an extension, then paste its URL here.</p>}
      {servers.map(server => <div key={server.id} className="flex flex-col gap-3 rounded-lg border p-4"><div className="flex flex-col gap-2"><Label htmlFor={`server-name-${server.id}`}>Server name</Label><Input id={`server-name-${server.id}`} value={server.name} onChange={event => { const rows = listServers().map(row => row.id === server.id ? { ...row, name: event.target.value } : row); saveServers(rows); setServers(rows); }} /></div><p className="break-all text-sm text-muted-foreground">{server.url}</p><div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { const rows = listServers().map(row => row.id === server.id ? { ...row, enabled: !row.enabled } : row); saveServers(rows); setServers(rows); }}>{server.enabled ? 'Disable' : 'Enable'}</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await serverRequest(server, '/sources'); setMessage(`${server.name} is connected`); })}>Test</Button>
        <Button variant="outline" size="sm" onClick={() => { setUrl(server.url); setPassword(''); setMessage('Enter the viewer password to reconnect.'); }}>Reconnect</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => { await serverRequest(server, '/auth/logout', {}).catch(() => {}); saveServers(listServers().filter(row => row.id !== server.id)); setMessage('Server disconnected'); })}>Remove</Button>
        <Button variant="outline" size="sm" asChild><a href={server.url} target="_blank" rel="noreferrer">Open server setup</a></Button>
      </div></div>)}
    </div>
  </SettingsSection>;
}
