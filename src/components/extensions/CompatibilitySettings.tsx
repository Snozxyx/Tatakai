import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { compatibilityRequest, type CompatibilitySource } from '@/core/extensions/compatibility/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Preference { position: number; key?: string; title: string; summary?: string; enabled: boolean; visible: boolean; kind: string; value: any; secret?: boolean; options: { value: string; label: string }[] }
interface UiNode { id: number; kind: string; text?: string; label?: string; hint?: string; input?: string; checked?: boolean; enabled?: boolean; tappable?: boolean; options?: string[]; selected?: number; value?: number; max?: number; children?: UiNode[] }
interface SettingsState { session: number; closed?: boolean; error?: string; windows: { id: string; title?: string; root: UiNode }[] }

function PreferenceField({ preference: p, save, busy }: { preference: Preference; save: (position: number, value: unknown) => void; busy: boolean }) {
  const [value, setValue] = useState(p.value);
  useEffect(() => setValue(p.value), [p.value]);
  const disabled = busy || !p.enabled;
  const id = `source-setting-${p.position}`;
  if (p.kind === 'boolean') return <Field orientation="horizontal" data-disabled={disabled} className="min-w-0">
    <FieldContent className="min-w-0 break-words">
      <FieldLabel htmlFor={id}>{p.title}</FieldLabel>
      {p.summary && <FieldDescription id={`${id}-description`}>{p.summary}</FieldDescription>}
    </FieldContent>
    <Switch id={id} className="self-center" aria-describedby={p.summary ? `${id}-description` : undefined} checked={!!value} disabled={disabled} onCheckedChange={v => save(p.position, v)} />
  </Field>;
  return <Field>
    <FieldLabel htmlFor={id}>{p.title}</FieldLabel>
    {p.summary && <FieldDescription>{p.summary}</FieldDescription>}
    {p.kind === 'boolean' ? <Switch id={id} checked={!!value} disabled={disabled} onCheckedChange={v => save(p.position, v)} />
      : p.kind === 'select' ? <Select value={String(p.options.findIndex(o => o.value === value))} disabled={disabled} onValueChange={v => save(p.position, p.options[Number(v)].value)}><SelectTrigger id={id}><SelectValue placeholder="Choose a value" /></SelectTrigger><SelectContent><SelectGroup>{p.options.map((o, index) => <SelectItem key={o.value} value={String(index)}>{o.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
      : p.kind === 'multiselect' ? <fieldset className="flex flex-col gap-2" aria-label={p.title}>{p.options.map(o => <label key={o.value} className="flex items-center gap-2"><Checkbox disabled={disabled} checked={Array.isArray(value) && value.includes(o.value)} onCheckedChange={checked => save(p.position, checked ? [...(Array.isArray(value) ? value : []), o.value] : (Array.isArray(value) ? value : []).filter(v => v !== o.value))} />{o.label}</label>)}</fieldset>
      : p.kind === 'text' ? <div className="flex gap-2"><Input id={id} type={p.secret ? 'password' : 'text'} autoComplete="off" value={String(value ?? '')} disabled={disabled} onChange={e => setValue(e.target.value)} /><Button variant="outline" disabled={disabled || value === p.value} onClick={() => save(p.position, value)}>Save</Button></div>
      : <FieldDescription>This control needs an additional host adapter.</FieldDescription>}
  </Field>;
}
function ExtensionNode({ node, act, busy, depth = 0 }: { node: UiNode; act: (node: number, action: string, value?: unknown) => void; busy: boolean; depth?: number }) {
  if (depth > 20) return null;
  const label = node.label || node.text || node.hint || 'Extension control', disabled = busy || node.enabled === false;
  if (node.children) return <div className="flex flex-col gap-3">{node.children.slice(0, 300).map(child => <ExtensionNode key={child.id} node={!child.label && !child.text && child.checked !== undefined ? { ...child, label: node.children?.find(sibling => sibling.kind === 'text' && sibling.text)?.text || node.label } : child} act={act} busy={busy} depth={depth + 1} />)}</div>;
  if (node.kind === 'page' || node.kind === 'web') return <p className="text-sm text-muted-foreground">This extension’s page opens in the local extension browser window.</p>;
  if (node.checked !== undefined) return <label className="flex items-center justify-between gap-3"><span>{label}</span><Switch aria-label={label} disabled={disabled} checked={node.checked} onCheckedChange={value => act(node.id, 'check', value)} /></label>;
  if (node.options) return <Select value={String(node.selected ?? 0)} disabled={disabled} onValueChange={v => act(node.id, 'select', Number(v))}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{node.options.map((text, i) => <SelectItem key={i} value={String(i)}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select>;
  if (node.input) return <Field><FieldLabel htmlFor={`extension-node-${node.id}`}>{label}</FieldLabel><Input key={node.id} id={`extension-node-${node.id}`} type={['password', 'email', 'number', 'url'].includes(node.input) ? node.input : 'text'} defaultValue={node.text || ''} placeholder={node.hint} disabled={disabled} onBlur={e => act(node.id, 'text', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { act(node.id, 'text', e.currentTarget.value); act(node.id, 'submit', e.currentTarget.value); } }} /></Field>;
  if (node.kind === 'seek' || node.kind === 'slider') return <Field><FieldLabel htmlFor={`extension-node-${node.id}`}>{label}</FieldLabel><Input id={`extension-node-${node.id}`} type="range" min={0} max={node.max || 100} defaultValue={node.value || 0} disabled={disabled} onPointerUp={e => act(node.id, 'slide', Number(e.currentTarget.value))} onKeyUp={e => act(node.id, 'slide', Number(e.currentTarget.value))} /></Field>;
  if (node.tappable || node.kind === 'button') return <Button variant="outline" disabled={disabled} onClick={() => act(node.id, 'click')}>{label}</Button>;
  return <p className="whitespace-pre-wrap break-words text-sm">{node.text || node.label}</p>;
}

export function CompatibilitySettings({ source, onClose, authentication = false }: { source: CompatibilitySource; onClose: () => void; authentication?: boolean }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<number>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signIn = useRef<AbortController>();
  useEffect(() => () => signIn.current?.abort(), []);
  const cloudstream = source.ecosystem === 'cloudstream';
  const call = <T,>(op: string, extra: Record<string, unknown> = {}) => compatibilityRequest<T>({ op, ecosystem: source.ecosystem, sourceId: source.id, ...extra });
  useEffect(() => {
    if (!cloudstream) return;
    let closed = false, active: number | undefined;
    void call<{ session: number }>('settings').then(result => { active = result.session; if (closed) void call('closeSettings', { session: active }).catch(() => {}); else setSession(active); }).catch(e => { if (!closed) setError(e.message); });
    return () => { closed = true; if (active !== undefined) void call('closeSettings', { session: active }).catch(() => {}); };
  }, [source.id]);
  const preferences = useQuery({ queryKey: ['compatibility-settings', source.id], enabled: !cloudstream, queryFn: () => call<Preference[]>('preferences'), retry: false });
  const screen = useQuery({ queryKey: ['compatibility-screen', source.id, session], enabled: cloudstream && session !== undefined,
    queryFn: () => call<SettingsState>('settingsState', { session }), refetchInterval: query => query.state.data?.closed ? false : 750, retry: false });
  async function mutate(op: string, extra: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await call(op, extra); await queryClient.invalidateQueries({ queryKey: [cloudstream ? 'compatibility-screen' : 'compatibility-settings', source.id] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save source setting'); }
    finally { setBusy(false); }
  }
  async function authenticate() {
    setBusy(true); setError('');
    const controller = new AbortController(); signIn.current = controller;
    try { await compatibilityRequest({ op: 'authenticate', sourceId: source.id, ecosystem: source.ecosystem }, controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Source sign-in failed'); }
    finally { setBusy(false); }
  }
  const state = screen.data;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] min-w-0 max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{source.name} settings</DialogTitle><DialogDescription>Settings belong to this extension on this device.</DialogDescription></DialogHeader>
    {(error || preferences.error || screen.error || state?.error) && <Alert variant="destructive"><AlertDescription role="alert">{error || preferences.error?.message || screen.error?.message || state?.error}</AlertDescription></Alert>}
    {authentication && <Field><Button variant="outline" disabled={busy} onClick={() => void authenticate()}>Sign in to source</Button><FieldDescription>Sign in in the source’s browser window, then close it to save its cookies on this device.</FieldDescription></Field>}
    {cloudstream ? <>
      {session === undefined && !error && <p role="status">Opening the extension’s settings…</p>}
      {state?.closed && <p>The extension closed this settings screen.</p>}
      {!state?.closed && state?.windows?.filter(w => !(w as any).hidden).map(window => <FieldGroup key={window.id}>{window.title && <h3 className="font-semibold">{window.title}</h3>}<ExtensionNode node={window.root} busy={busy} act={(node, action, value) => void mutate('settingsAction', { session, node, action, value })} /></FieldGroup>)}
    </> : <FieldGroup>
      {preferences.isPending && <p role="status">Loading source settings…</p>}
      {preferences.data?.filter(p => p.visible).map(p => <PreferenceField key={p.position} preference={p} busy={busy} save={(position, value) => void mutate('setPreference', { position, value })} />)}
      {preferences.data?.length === 0 && <p>This source has no configurable preferences.</p>}
    </FieldGroup>}
  </DialogContent></Dialog>;
}
