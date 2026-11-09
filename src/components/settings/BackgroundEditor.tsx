import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useCustomization } from '@/hooks/ui/useCustomization';
import { appearanceBackgroundStyle, discardStagedAppearanceOwner, safeAppearanceColor, stageAppearanceImage, useAppearanceAsset } from '@/lib/appearanceAssets';
import { randomUUID } from '@/lib/uuid';
import { cn } from '@/lib/utils';
import type { BackgroundConfig } from '@/lib/customization';

const DraftOwnerContext = createContext<string | undefined>(undefined);
export function AppearanceDraftProvider({ children, resetKey }: { children?: ReactNode; resetKey?: string | number }) {
  const [owner] = useState(() => randomUUID());
  useEffect(() => () => discardStagedAppearanceOwner(owner), [owner, resetKey]);
  return <DraftOwnerContext.Provider value={owner}>{children}</DraftOwnerContext.Provider>;
}

export function AppearanceBackground({ background, children, className }: { background?: BackgroundConfig | null; children?: ReactNode; className?: string }) {
  const url = useAppearanceAsset(background?.asset);
  const layer = <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]', children === undefined && className)}>
    <div data-appearance-artwork className="absolute inset-0" style={appearanceBackgroundStyle(background, url)} />
    {!!background?.tint && <div className="absolute inset-0" style={{ background: safeAppearanceColor(background.tint), opacity: Math.max(0, Math.min(1, background.tintOpacity ?? 0.3)) }} />}
  </div>;
  return children === undefined ? layer : <div className={cn('relative', className)}>{layer}<div className="relative">{children}</div></div>;
}

export function BackgroundEditor({ value, onChange }: { value?: BackgroundConfig | null; onChange: (value: BackgroundConfig | null) => void }) {
  const { t } = useTranslation();
  const { userId } = useCustomization();
  const input = useRef<HTMLInputElement>(null);
  const owner = useContext(DraftOwnerContext);
  const [error, setError] = useState<string>();
  const blur = typeof value?.blur === 'number' && Number.isFinite(value.blur) ? Math.max(0, Math.min(64, value.blur)) : 0;
  const change = (patch: Partial<BackgroundConfig>) => onChange({ type: 'solid', ...value, ...patch });
  return <div className="space-y-3" data-customization-background-editor>
    <div className="flex flex-wrap items-center gap-2">
      <ThemedSelect aria-label={t('customization.backgroundType', 'Background')} value={value?.type ?? 'default'} onChange={event => {
        const type = event.target.value;
        if (type === 'default') onChange(null);
        else if (type === 'gradient') change({ type, gradient: value?.gradient ?? 'linear-gradient(135deg, #292039, #12121b)' });
        else change({ type: type as BackgroundConfig['type'], color: value?.color ?? '#14141c' });
      }}>
        <option value="default">{t('customization.default', 'Default')}</option>
        <option value="solid">{t('customization.solid', 'Solid color')}</option>
        <option value="gradient">{t('customization.gradient', 'Gradient')}</option>
        <option value="image">{t('customization.image', 'Uploaded image')}</option>
      </ThemedSelect>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}><RotateCcw className="mr-1 h-3.5 w-3.5" />{t('customization.reset', 'Reset')}</Button>
    </div>
    {value && <label className="flex items-center gap-2 text-sm"><span>{t('customization.backgroundColor', 'Background color')}</span><input type="color" aria-label={t('customization.backgroundColor', 'Background color')} value={/^#[\da-f]{6}$/i.test(value.color ?? '') ? value.color : '#14141c'} onChange={event => change({ color: event.target.value })} className="h-8 w-12 rounded border border-border bg-transparent" /></label>}
    {value?.type === 'gradient' && <label className="block space-y-1 text-sm"><span>{t('customization.gradient', 'Gradient')}</span><input aria-label={t('customization.gradient', 'Gradient')} value={value.gradient ?? ''} onChange={event => change({ gradient: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" /></label>}
    {value?.type === 'image' && <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        try { const asset = stageAppearanceImage(file, userId, owner); setError(undefined); change({ asset }); }
        catch (failure) { setError(failure instanceof Error ? failure.message : t('customization.imageFailed', 'This image could not be selected.')); }
      }} />
      <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />{t('customization.chooseImage', 'Choose image')}</Button>
      <p className="text-xs text-muted-foreground">{t('customization.localImageHint', 'Images stay on this device. No account or upload is required. PNG, JPEG, WebP, or GIF, up to 8 MB.')}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm"><span>{t('customization.imageFit', 'Image fit')}</span><ThemedSelect value={value.fit ?? 'cover'} aria-label={t('customization.imageFit', 'Image fit')} onChange={event => change({ fit: event.target.value as BackgroundConfig['fit'] })}><option value="cover">{t('customization.cover', 'Cover')}</option><option value="contain">{t('customization.contain', 'Contain')}</option><option value="tile">{t('customization.tile', 'Tile')}</option></ThemedSelect></label>
        <label className="flex items-center gap-2 text-sm"><span>{t('customization.imagePosition', 'Position')}</span><ThemedSelect value={value.position ?? 'center'} aria-label={t('customization.imagePosition', 'Position')} onChange={event => change({ position: event.target.value })}><option value="center">{t('customization.center', 'Center')}</option><option value="top">{t('customization.top', 'Top')}</option><option value="bottom">{t('customization.bottom', 'Bottom')}</option><option value="left">{t('customization.left', 'Left')}</option><option value="right">{t('customization.right', 'Right')}</option></ThemedSelect></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><span>{t('customization.imageTint', 'Overlay tint')}</span><input type="color" aria-label={t('customization.imageTint', 'Overlay tint')} value={/^#[\da-f]{6}$/i.test(value.tint ?? '') ? value.tint : '#000000'} onChange={event => change({ tint: event.target.value, tintOpacity: value.tintOpacity ?? 0.3 })} /><input type="range" min={0} max={1} step={0.05} value={value.tintOpacity ?? 0} aria-label={t('customization.tintStrength', 'Tint strength')} onChange={event => change({ tint: value.tint ?? '#000000', tintOpacity: Number(event.target.value) })} /></label>
    </>}
    {(value?.type === 'image' || value?.type === 'gradient') && <label className="block space-y-1 text-sm"><span className="flex justify-between"><span>{t('customization.backgroundBlur', 'Background blur')}</span><output>{blur}px</output></span><input type="range" min={0} max={64} step={1} aria-label={t('customization.backgroundBlur', 'Background blur')} value={blur} onChange={event => change({ blur: Number(event.target.value) })} className="w-full accent-primary" /></label>}
    {(value?.type === 'image' || value?.type === 'gradient') && <p className="text-xs text-muted-foreground">{t('customization.backgroundBlurHint', 'Blurs background artwork. System blur strength is controlled by your operating system.')}</p>}
    {value && <div aria-label={t('customization.backgroundPreview', 'Background preview')} className="relative h-20 overflow-hidden rounded-lg border border-border"><AppearanceBackground background={value} /></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
