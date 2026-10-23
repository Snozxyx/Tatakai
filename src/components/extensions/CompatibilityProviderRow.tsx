import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { languageLabel } from '@/core/extensions/remote/metadata';
import { compatibilityNamespace, type CompatibilitySource } from '@/core/extensions/compatibility/client';
import { ExtensionLogo } from './ExtensionLogo';

export function CompatibilityProviderRow({ id, name, sources, busy, icon, onEnabled, onSettings }: { id: string; name: string; sources: CompatibilitySource[]; busy: boolean; icon?: string; onEnabled(sources: CompatibilitySource[], enabled: boolean): void; onSettings(source: CompatibilitySource): void }) {
  const enabled = sources.filter(source => source.enabled), first = enabled[0] || sources[0];
  const controls = (source: CompatibilitySource) => <div className="flex shrink-0 items-center gap-2">{(source.ecosystem === 'mihon' || source.hasSettings) && <Button size="sm" variant="ghost" disabled={busy} aria-label={`Settings for ${name} ${languageLabel(source.lang)}`} onClick={() => onSettings(source)}>Settings</Button>}{source.enabled && <Button asChild size="sm" variant="outline"><Link to={`/x/${compatibilityNamespace(source)}/${source.id}`}>Browse</Link></Button>}</div>;
  return <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3">
    <div className="flex min-w-0 flex-wrap items-center gap-3"><ExtensionLogo name={name} src={icon} className="size-10" /><div className="min-w-0 flex-1 basis-32"><label className="break-words font-medium" htmlFor={id}>{name}</label><p className="text-xs text-muted-foreground">{sources.length === 1 ? languageLabel(first.lang) : `${enabled.length} of ${sources.length} languages enabled`}</p></div><Switch id={id} disabled={busy} checked={enabled.length > 0} onCheckedChange={value => onEnabled(sources, value)} />{sources.length === 1 && controls(first)}</div>
    {sources.length > 1 && <details className="min-w-0"><summary className="cursor-pointer rounded-md px-1 py-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Languages <Badge variant="outline">{sources.length}</Badge></summary><div className="flex max-h-64 flex-col gap-2 overflow-y-auto pt-2">{sources.map(source => <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 p-2"><label htmlFor={`${id}-${source.id}`} className="min-w-0 flex-1 text-sm">{languageLabel(source.lang)}</label>{controls(source)}<Switch id={`${id}-${source.id}`} disabled={busy} checked={source.enabled} onCheckedChange={value => onEnabled([source], value)} /></div>)}</div></details>}
  </div>;
}
