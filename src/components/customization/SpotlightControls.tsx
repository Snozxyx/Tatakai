import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/themed-select';
import { customizationLabel as label, customizationMessage as message } from '@/lib/customizationLabels';
import type { SpotlightPresentation } from '@/lib/customization';
import { SPOTLIGHT_PARTS, SPOTLIGHT_PLACEMENTS } from './SpotlightPresentation';

export function SpotlightControls({ value, onChange }: { value?: SpotlightPresentation | null; onChange(value: SpotlightPresentation): void }) {
  const change = (patch: Partial<SpotlightPresentation>) => onChange({ ...value, ...patch });
  const fieldClass = 'mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm';
  return <fieldset className="space-y-3"><legend className="text-sm font-semibold">{label('Spotlight appearance')}</legend>
    <label className="block text-sm">{label('Style')}<ThemedSelect aria-label={label('Spotlight style')} className={fieldClass} value={value?.variant || 'default'} onChange={event => change({ variant: event.target.value as SpotlightPresentation['variant'] })}><option value="default">{label('Original layout')}</option><option value="classic">{label('Classic')}</option><option value="cinematic">{label('Cinematic')}</option></ThemedSelect></label>
    {value?.variant === 'cinematic' && <p className="text-xs text-muted-foreground">{message('spotlight_drag_hint', 'Drag the handles in the live preview to move the title, details, description and buttons.')}</p>}
    <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">{label('Advanced')}</summary><div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">{label('Height')}<Input type="number" className="mt-1" min={320} max={1000} value={value?.height ?? ''} placeholder={label('Automatic')} onChange={event => change({ height: event.target.value ? Number(event.target.value) : undefined })} /></label>
        <label className="text-xs text-muted-foreground">{label('Title alignment')}<ThemedSelect className={fieldClass} value={value?.titleAlign ?? ''} onChange={event => change({ titleAlign: event.target.value ? event.target.value as SpotlightPresentation['titleAlign'] : undefined })}><option value="">{label('Original layout')}</option><option value="left">{label('Left')}</option><option value="center">{label('Center')}</option><option value="right">{label('Right')}</option></ThemedSelect></label>
        <label className="text-xs text-muted-foreground">{label('Shade')}<Input type="range" className="mt-1" min={0} max={1} step={0.05} value={value?.shade ?? 0.8} onChange={event => change({ shade: Number(event.target.value) })} /></label>
        <label className="text-xs text-muted-foreground">{label('Background blur')} <output>{value?.backgroundBlur ?? 22}px</output><Input type="range" className="mt-1" aria-label={label('Background blur')} min={0} max={64} step={1} value={value?.backgroundBlur ?? 22} onChange={event => change({ backgroundBlur: Number(event.target.value) })} /></label>
        <label className="text-xs text-muted-foreground">{label('Title size')}<Input type="number" className="mt-1" min={18} max={96} value={value?.titleSize ?? ''} placeholder={label('Automatic')} onChange={event => change({ titleSize: event.target.value ? Number(event.target.value) : undefined })} /></label>
      </div>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value?.showDescription !== false} onChange={event => change({ showDescription: event.target.checked })} />{label('Description')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value?.showMetadata !== false} onChange={event => change({ showMetadata: event.target.checked })} />{label('Details')}</label></div>
      {value?.variant === 'cinematic' && <div className="grid gap-3 sm:grid-cols-2">{SPOTLIGHT_PARTS.map(part => <label key={part} className="text-xs text-muted-foreground">{label(part)}<ThemedSelect className={fieldClass} value={value?.placements?.[part] || 'original'} onChange={event => change({ placements: { ...value?.placements, [part]: event.target.value as typeof SPOTLIGHT_PLACEMENTS[number] } })}>{SPOTLIGHT_PLACEMENTS.map(placement => <option key={placement} value={placement}>{placement === 'original' ? label('Original position') : label(placement.replace(/-/g, ' '))}</option>)}</ThemedSelect></label>)}</div>}
    </div></details>
  </fieldset>;
}
