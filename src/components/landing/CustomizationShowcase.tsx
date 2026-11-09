import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeftRight, RotateCcw, LayoutGrid, Palette, UserRound, Home, BookOpen } from 'lucide-react';
import { CustomCardLayout } from '@/components/customization/CustomCardLayout';
import type { CardDesign } from '@/lib/customization';
import { widgetThemeFromColors } from '@/lib/widgetTheme';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import uiI18n from '@/lib/uiI18n';
import onePiece from '@/assets/landing-enhancers/one-piece.webp?inline';
import chainsawMan from '@/assets/landing-enhancers/chainsaw-man.webp?inline';
import artwork from '@/assets/landing-cherry-scene.webp?inline';

const palettes = [
  { id: 'cherry', background: '#171215', foreground: '#f5eef1', accent: '#e85888' },
  { id: 'ink', background: '#13171b', foreground: '#e8edf1', accent: '#96b7c8' },
  { id: 'paper', background: '#f2eee5', foreground: '#302c28', accent: '#9a495c' },
] as const;

export function CustomizationShowcase() {
  useUiTranslation();
  const [base, setBase] = useState<'poster' | 'overlay'>('poster');
  const [palette, setPalette] = useState(0);
  const [background, setBackground] = useState<'solid' | 'gradient' | 'artwork'>('solid');
  const [customColor, setCustomColor] = useState<string>();
  const [radius, setRadius] = useState(12);
  const [spacing, setSpacing] = useState(24);
  const [padding, setPadding] = useState(12);
  const [titleSize, setTitleSize] = useState(16);
  const [showType, setShowType] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [reverse, setReverse] = useState(false);
  const colors = palettes[palette];
  const bg = customColor || colors.background;
  const previewTheme = widgetThemeFromColors({ background: bg, foreground: colors.foreground, primary: colors.accent });
  const design: CardDesign = { id: 'landing-preview', name: 'Preview', base, style: { radius, padding, gap: 6, titleSize, titleWeight: 500,
    titleLines: 2, borderColor: 'hsl(var(--border))', borderWidth: 1, textColor: base === 'poster' ? 'hsl(var(--foreground))' : '#fff', shadow: 'none', gradient: .85 } };
  const cards = [{ title: 'ONE PIECE', cover: onePiece }, { title: 'Chainsaw Man', cover: chainsawMan }];
  if (reverse) cards.reverse();
  const reset = () => { setBase('poster'); setPalette(0); setBackground('solid'); setCustomColor(undefined); setRadius(12); setSpacing(24); setPadding(12); setTitleSize(16); setShowType(true); setSidebar(false); setReverse(false); };
  const sliders = [
    { key: 'radius', value: radius, set: setRadius, min: 4, max: 24, step: 4 },
    { key: 'spacing', value: spacing, set: setSpacing, min: 8, max: 32, step: 4 },
    { key: 'padding', value: padding, set: setPadding, min: 8, max: 24, step: 4 },
    { key: 'titleSize', value: titleSize, set: setTitleSize, min: 14, max: 22, step: 2 },
  ];
  return <section data-landing-customization className="border-t border-white/10" aria-labelledby="customization-heading">
    <div className="mb-8 max-w-3xl"><p className="mb-4 text-xs font-medium text-white/65">{uiI18n.t('landingCustomization.eyebrow')}</p>
      <h2 id="customization-heading" className="font-display text-white">{uiI18n.t('landingCustomization.title')}</h2>
      <p className="mt-5 text-base leading-relaxed text-white/70">{uiI18n.t('landingCustomization.description')}</p>
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-medium text-white">{uiI18n.t('landingCustomization.controls')}</h3>
          <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-white/65 hover:bg-white/5"><RotateCcw aria-hidden className="size-3.5" />{uiI18n.t('landingCustomization.reset')}</button></div>
        <div className="mt-5 space-y-5">
          <div><p className="mb-2 text-xs font-medium text-white/70">{uiI18n.t('landingCustomization.layoutChoice')}</p><div role="group" aria-label={uiI18n.t('landingCustomization.layoutChoice')} className="flex gap-2">{(['poster', 'overlay'] as const).map(value => <button key={value} type="button" aria-pressed={base === value} onClick={() => setBase(value)} className={`min-h-10 flex-1 rounded-lg border px-3 text-sm ${base === value ? 'border-primary/40 bg-primary/10 text-white' : 'border-white/10 text-white/60'}`}>{uiI18n.t(`landingCustomization.${value}`)}</button>)}</div></div>
          <div><p className="mb-2 text-xs font-medium text-white/70">{uiI18n.t('landingCustomization.paletteChoice')}</p><div role="group" aria-label={uiI18n.t('landingCustomization.paletteChoice')} className="flex flex-wrap gap-2">{palettes.map((value, index) => <button key={value.id} type="button" aria-pressed={palette === index} onClick={() => { setPalette(index); setCustomColor(undefined); }} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs text-white/80 ${palette === index ? 'border-primary/40 bg-white/5' : 'border-white/10'}`}><span className="size-3 rounded-full" style={{ background: value.accent }} />{uiI18n.t(`landingCustomization.${value.id}`)}</button>)}</div></div>
          <div><p className="mb-2 text-xs font-medium text-white/70">{uiI18n.t('landingCustomization.background')}</p><div role="group" aria-label={uiI18n.t('landingCustomization.background')} className="grid grid-cols-3 gap-2">{(['solid', 'gradient', 'artwork'] as const).map(value => <button key={value} type="button" aria-pressed={background === value} onClick={() => setBackground(value)} className={`min-h-10 rounded-lg border px-2 text-xs ${background === value ? 'border-primary/40 bg-white/5 text-white' : 'border-white/10 text-white/60'}`}>{uiI18n.t(`landingCustomization.${value}`)}</button>)}</div></div>
          <label className="flex items-center justify-between gap-3 text-xs text-white/70"><span>{uiI18n.t('landingCustomization.backgroundColor')}</span><input type="color" value={bg} onChange={event => setCustomColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-white/20 bg-transparent p-1" /></label>
          <div className="grid gap-4 sm:grid-cols-2">{sliders.map(control => <label key={control.key} className="block"><span className="mb-2 flex justify-between gap-2 text-xs text-white/70"><span>{uiI18n.t(`landingCustomization.${control.key}`)}</span><output className="tabular-nums">{control.value}px</output></span><input type="range" min={control.min} max={control.max} step={control.step} value={control.value} onChange={event => control.set(Number(event.target.value))} className="w-full accent-primary" /></label>)}</div>
          <div className="flex flex-wrap gap-4 border-t border-white/10 pt-4"><label className="flex min-h-10 items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={showType} onChange={event => setShowType(event.target.checked)} className="size-4 accent-primary" />{uiI18n.t('landingCustomization.showDetails')}</label><label className="flex min-h-10 items-center gap-2 text-xs text-white/75"><input type="checkbox" checked={sidebar} onChange={event => setSidebar(event.target.checked)} className="size-4 accent-primary" />{uiI18n.t('landingCustomization.showSidebar')}</label></div>
          <button type="button" onClick={() => setReverse(value => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/75 hover:bg-white/5"><ArrowLeftRight aria-hidden className="size-3.5" />{uiI18n.t('landingCustomization.swap')}</button>
        </div>
      </div>
      <div data-customization-demo className="relative overflow-hidden rounded-2xl border border-white/10" style={{ ...previewTheme, background: bg, color: 'hsl(var(--foreground))' }}>
        {background === 'gradient' && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(135deg, ${bg}, ${colors.accent}44)` }} />}
        {background === 'artwork' && <div aria-hidden className="pointer-events-none absolute inset-0"><img src={artwork} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0" style={{ background: bg, opacity: .75 }} /></div>}
        <div className="relative flex min-h-16 items-center justify-between gap-3 border-b border-border px-5"><span className="font-display text-sm font-medium">Tatakai</span><span className="text-xs text-muted-foreground">{uiI18n.t('landingCustomization.livePreview')}</span></div>
        <div className="relative grid" style={{ gridTemplateColumns: sidebar ? '56px minmax(0,1fr)' : 'minmax(0,1fr)' }}>
          {sidebar && <div aria-hidden className="flex flex-col items-center gap-6 border-r border-border py-6">{[Home, BookOpen, UserRound].map((Icon, index) => <span key={index} className="rounded-lg p-2" style={{ background: index === 0 ? colors.accent : 'transparent', color: index === 0 ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }}><Icon className="size-4" /></span>)}</div>}
          <div className="mx-auto grid w-full max-w-xl grid-cols-2 p-5 sm:p-8" style={{ gap: spacing }}>
            {cards.map(item => <CustomCardLayout key={item.title} design={design} title={item.title} readOnly poster={<img src={item.cover} alt="" className="h-full w-full object-cover" />} slots={{ title: item.title, ...(showType ? { type: uiI18n.t('app.manga_87db0f99') } : {}) }} />)}
          </div>
        </div>
        <p className="relative border-t border-border px-5 py-4 text-xs text-muted-foreground">{uiI18n.t('landingCustomization.previewNote')}</p>
      </div>
    </div>
    <div className="mt-6 grid gap-5 md:grid-cols-3">{[{ id: 'layouts', icon: LayoutGrid }, { id: 'themes', icon: Palette }, { id: 'profiles', icon: UserRound }].map(({ id, icon: Icon }) => <div key={id} className="flex gap-3 border-t border-white/10 pt-5"><Icon aria-hidden className="mt-1 size-[18px] shrink-0 text-white/60" /><div><h3 className="text-base font-medium text-white">{uiI18n.t(`landingCustomization.${id}Title`)}</h3><p className="mt-2 text-sm leading-relaxed text-white/65">{uiI18n.t(`landingCustomization.${id}Body`)}</p></div></div>)}</div>
    <Link to="/settings?tab=appearance" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-black hover:bg-white/90">{uiI18n.t('landingCustomization.open')}<ArrowRight aria-hidden className="size-4" /></Link>
  </section>;
}
