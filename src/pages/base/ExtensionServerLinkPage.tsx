import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectServer, normalizeServerUrl } from '@/core/extensions/server/client';

export default function ExtensionServerLinkPage() {
  const location = useLocation(), navigate = useNavigate();
  const [input] = useState(() => {
    const captured = (window as Window & { __tatakaiServerLink?: { pathname: string; search: string } }).__tatakaiServerLink || location;
    const params = new URLSearchParams(captured.search);
    let raw = captured.pathname.slice('/extensionserver/'.length);
    if (raw === 'confirm') return { url: '', password: '', error: 'This confirmation link was refreshed. Enter the server URL and viewer password again, or reopen the original connection link.' };
    try { raw = decodeURIComponent(raw); } catch { /* Validation below explains invalid URLs. */ }
    if (raw && !/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try { return { url: normalizeServerUrl(raw), password: params.get('pass') || '', error: '' }; }
    catch (error) { return { url: raw, password: '', error: error instanceof Error ? error.message : 'Invalid server URL' }; }
  });
  const [url, setUrl] = useState(input.url), [password, setPassword] = useState(input.password), [error, setError] = useState(input.error), [busy, setBusy] = useState(false);
  useEffect(() => { delete (window as Window & { __tatakaiServerLink?: unknown }).__tatakaiServerLink; window.history.replaceState(null, '', '/extensionserver/confirm'); }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await connectServer(url, password); setPassword(''); navigate('/settings?tab=extensions', { replace: true }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not connect'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) navigate('/', { replace: true }); }}><DialogContent>
    <DialogHeader><DialogTitle>Connect extension server?</DialogTitle><DialogDescription>This server will receive source searches and provide media through its proxy. Connect only to a server you trust.</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={connect}>
      <div className="flex flex-col gap-2"><Label htmlFor="link-server-url">Server URL</Label><Input id="link-server-url" type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="http://127.0.0.1:8902" /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="link-server-password">Viewer access password (optional for public servers)</Label><Input id="link-server-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => navigate('/', { replace: true })}>Cancel</Button><Button disabled={busy || !url}>{busy ? 'Connecting…' : 'Confirm and connect'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
