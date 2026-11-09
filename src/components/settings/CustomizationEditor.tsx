import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus, RotateCcw, Save, Trash2, X, LayoutDashboard, Palette, PanelsTopLeft, PanelLeft, ArrowRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme, resolveColors } from '@/hooks/ui/useTheme';
import { CustomizationScopeProvider, useCustomization } from '@/hooks/ui/useCustomization';
import { getThemeCustomization, getTargetCustomization, type CardDesign, type CustomizationSettings, type CustomizationPatch, type LayoutTarget, type LogoChoice, type ThemeCustomization, type ThemeSelection } from '@/lib/customization';
import { randomUUID } from '@/lib/uuid';
import { diffCustomizationValue as customizationDifference } from '@/lib/customizationDraft';
import { isTV } from '@/core/tv/device';
import { ThemedSelect } from '@/components/ui/themed-select';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/settings/SettingsPrimitives';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { AppearanceBackground, AppearanceDraftProvider, BackgroundEditor } from '@/components/settings/BackgroundEditor';
import { CardDesignPreviewProvider } from '@/components/customization/CardDesignContext';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { TVContentCard } from '@/components/tv/TVContentCard';
import { BrandLogo } from '@/components/branding/BrandLogo';
import { LauncherIconSelector } from '@/components/settings/LauncherIconSelector';
import { CardDesignEditor } from './CardDesignEditor';
import { MediaCardStyleSelector } from './MediaCardStyleSelector';
import { ThemeSelector } from './ThemeSelector';
import { MobileAppearanceSelector } from './MobileAppearanceSelector';
import { SidebarCustomizationEditor } from './SidebarCustomizationEditor';
import { SpotlightCustomizationEditor } from './SpotlightCustomizationEditor';
import { DesktopBackdropSelector } from './DesktopBackdropSelector';
import './customization-editor.css';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export { customizationDifference };
export function paletteHex(value: string): string {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const [h, s0, l0] = value.split(/\s+/).map(parseFloat);
  if (![h, s0, l0].every(Number.isFinite)) return '#808080';
  const s = s0 / 100, l = l0 / 100, a = s * Math.min(l, 1 - l);
  return '#' + [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }).join('');
}
export function paletteHsl(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
  const hue = delta === 0 ? 0 : max === r ? ((g - b) / delta + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `${Math.round(hue * 10) / 10} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

export function CustomizationEditor() {
  const { t } = useTranslation();
  const { theme, selection, setSelection, themes, themeInfo } = useTheme();
  const { settings, savePatch, syncStatus } = useCustomization();
  const { closeSettings } = useSettingsModal();
  const navigate = useNavigate();
  const [base, setBase] = useState(settings);
  const [draft, setDraft] = useState<CustomizationSettings>(() => clone(settings));
  const [selectedAppearance, setSelectedAppearance] = useState<ThemeSelection>(selection);
  const [baseAppearance, setBaseAppearance] = useState<ThemeSelection>(selection);
  const [editTheme, setEditTheme] = useState(theme);
  const [target, setTarget] = useState<LayoutTarget>(() => isTV() ? 'tv' : typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop');
  const [designId, setDesignId] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'home' | 'spotlight' | 'theme' | 'background' | 'cards' | 'sidebar'>('home');
  const [message, setMessage] = useState('');
  const [draftReset, setDraftReset] = useState(0);
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [customThemeName, setCustomThemeName] = useState('');
  const [customThemeBase, setCustomThemeBase] = useState('cherry-blossom');
  const dirty = JSON.stringify(base) !== JSON.stringify(draft) || JSON.stringify(baseAppearance) !== JSON.stringify(selectedAppearance);
  const settingsKey = JSON.stringify(settings), selectionKey = JSON.stringify(selection);
  useEffect(() => {
    if (!dirty) { setBase(settings); setDraft(clone(settings)); setSelectedAppearance(selection); setBaseAppearance(selection); }
  }, [settingsKey, selectionKey, dirty]);
  const config = getThemeCustomization(draft, editTheme);
  const availableThemes = [...new Set([...themes, ...Object.entries(draft.customThemes || {}).filter(([, definition]) => !!definition).map(([id]) => id)])].filter(id => draft.customThemes?.[id] !== null);
  const invalidThemeName = Object.values(draft.customThemes || {}).some(definition => definition && !definition.name.trim());
  const availableInfo = { ...themeInfo };
  for (const [id, definition] of Object.entries(draft.customThemes || {})) if (definition) availableInfo[id] = { ...themeInfo[definition.baseTheme], name: definition.name, icon: '🎨', category: resolveColors(id, draft.customThemes).isLight ? 'light' : 'dark' };
  const targetConfig = getTargetCustomization(draft, editTheme, target);
  const designs = Object.values(targetConfig.designs || {}).filter((value): value is CardDesign => !!value);
  const design = designs.find(value => value.id === (designId || targetConfig.activeDesign));
  const updateTheme = (patch: Partial<ThemeCustomization>) => setDraft(current => ({ ...current, themes: { ...current.themes, [editTheme]: { ...getThemeCustomization(current, editTheme), ...patch } } }));
  const updateTarget = (patch: Partial<typeof targetConfig>) => updateTheme({ targets: { ...config.targets, [target]: { ...targetConfig, ...patch } } });
  const updateDesign = (value: CardDesign) => updateTarget({ designs: { ...targetConfig.designs, [value.id]: value } });
  const addDesign = (source?: CardDesign) => {
    const id = randomUUID();
    const value = { ...(source ? clone(source) : { base: 'overlay' as const }), id, name: source ? `${source.name} ${t('customization.copySuffix')}` : t('customization.newDesign') };
    updateTarget({ designs: { ...targetConfig.designs, [id]: value }, activeDesign: id });
    setDesignId(id);
  };
  const colors = useMemo(() => ({ ...resolveColors(editTheme, draft.customThemes), ...config.palette }), [editTheme, config.palette, draft.customThemes]);
  const previewStyle = Object.fromEntries(Object.entries(colors).filter(([, value]) => typeof value === 'string').map(([key, value]) => [`--${key.replace(/[A-Z]/g, char => '-' + char.toLowerCase())}`, value])) as CSSProperties;
  const selected = target === 'tv' ? draft.tvSelection || { mode: 'manual' as const, theme: 'cherry-blossom', lightTheme: 'light-minimal', darkTheme: 'cherry-blossom' } : selectedAppearance;
  const changeSelection = (patch: Partial<ThemeSelection>) => { const next = { ...selected, ...patch }; if (target === 'tv') setDraft(current => ({ ...current, tvSelection: next })); else setSelectedAppearance(next); };
  const createTheme = () => {
    if (!customThemeName.trim()) return;
    const id = `custom:${randomUUID()}`;
    const source = getThemeCustomization(draft, customThemeBase);
    const palette = Object.fromEntries(Object.entries({ ...resolveColors(customThemeBase, draft.customThemes), ...source.palette }).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    const definition = { name: customThemeName.trim(), baseTheme: draft.customThemes?.[customThemeBase]?.baseTheme || customThemeBase };
    setDraft(current => ({ ...current, customThemes: { ...current.customThemes, [id]: definition }, themes: { ...current.themes, [id]: { ...clone(source), palette } } }));
    changeSelection({ mode: 'manual', theme: id }); setEditTheme(id); setDesignId(''); setCreatingTheme(false);
  };
  const deleteTheme = () => {
    const id = editTheme;
    const remove = (value: ThemeSelection): ThemeSelection => ({ ...value, theme: value.theme === id ? 'cherry-blossom' : value.theme, lightTheme: value.lightTheme === id ? 'light-minimal' : value.lightTheme, darkTheme: value.darkTheme === id ? 'cherry-blossom' : value.darkTheme });
    setDraft(current => ({ ...current, customThemes: { ...current.customThemes, [id]: null }, themes: { ...current.themes, [id]: null }, ...(current.tvSelection ? { tvSelection: remove(current.tvSelection) } : {}) }));
    setSelectedAppearance(current => remove(current)); setEditTheme('cherry-blossom'); setDesignId('');
  };
  const cancel = () => { setCreatingTheme(false); setDraftReset(value => value + 1); setDraft(clone(settings)); setBase(settings); setSelectedAppearance(selection); setBaseAppearance(selection); setEditTheme(target === 'tv' ? settings.tvSelection?.theme || 'cherry-blossom' : theme); setDesignId(''); setMessage(t('customization.cancelled')); };
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const patch = customizationDifference(base, draft) as CustomizationPatch | undefined;
      if (patch) await savePatch(patch);
      if (JSON.stringify(selectedAppearance) !== JSON.stringify(baseAppearance)) setSelection(selectedAppearance);
      setBase(clone(draft)); setBaseAppearance(clone(selectedAppearance)); setMessage(t('customization.saved'));
    } catch (error) { toast.error(error instanceof Error ? error.message : t('customization.saveFailed')); }
    finally { setSaving(false); }
  };
  const editPage = (path: string) => { const query = new URLSearchParams({ customize: '1', customizationTarget: target, customizationTheme: editTheme }); const route = target === 'tv' && !isTV() ? `/customize-tv/${path === '/' ? 'home' : path.slice(1)}` : path; closeSettings(); navigate(`${route}?${query}`); };
  return <AppearanceDraftProvider resetKey={draftReset}><div className="space-y-8" data-customization-editor>
    <SettingsSection title={t('customization.title')} description={t('customization.simpleDescription')}>
      <div className="customization-tabs" role="tablist" aria-label={t('customization.title')}>
        {([['home', LayoutDashboard], ['spotlight', Sparkles], ['theme', Palette], ['background', ImageIcon], ['cards', PanelsTopLeft], ['sidebar', PanelLeft]] as const).map(([value, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} aria-controls={`customization-${value}`} onClick={() => setTab(value)}><Icon className="size-4" />{t(`customization.tabs.${value}`)}</button>)}
      </div>
      <div className="customization-control-grid">
        {(tab === 'cards' || tab === 'background' || tab === 'spotlight' || tab === 'theme' && selected.mode === 'system') && <label className="customization-field"><span>{t('customization.editTheme')}</span><ThemedSelect value={editTheme} onChange={event => { setEditTheme(event.target.value); setDesignId(''); if (tab === 'theme' && selected.mode === 'manual') changeSelection({ theme: event.target.value }); }}>{availableThemes.map(id => <option key={id} value={id}>{availableInfo[id]?.name || id}</option>)}</ThemedSelect></label>}
        {tab !== 'sidebar' && tab !== 'background' && <label className="customization-field"><span>{t('customization.previewTarget')}</span><ThemedSelect value={target} onChange={event => { setTarget(event.target.value as LayoutTarget); setDesignId(''); }}>{(['desktop', 'mobile', 'tv'] as const).map(value => <option key={value} value={value}>{t(`customization.${value}`)}</option>)}</ThemedSelect></label>}
      </div>
      {dirty && <div className="customization-editor-actions customization-savebar">
        <Button size="sm" disabled={!dirty || saving || invalidThemeName} onClick={save}><Save className="size-4" />{t('customization.save')}</Button>
        <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={cancel}><X className="size-4" />{t('customization.cancel')}</Button>
        <span role="status" className="text-xs text-muted-foreground">{invalidThemeName ? t('customization.themeNameRequired') : saving ? t('customization.saving') : dirty ? t('customization.unsaved') : message}</span>
      </div>}
      {syncStatus === 'pending' && <p className="mt-2 text-xs text-muted-foreground">{t('customization.sync.pending')}</p>}
      {!dirty && message && <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </SettingsSection>
    {tab === 'theme' && <SettingsSection title={t('customization.activeAppearance')} description={target === 'tv' ? t('customization.tvIndependent') : t('customization.systemDescription')}>
      <Button size="sm" variant="outline" className="mb-3" onClick={() => { setCreatingTheme(value => !value); setCustomThemeBase(editTheme); setCustomThemeName(t('customization.newTheme')); }}><Plus className="size-4" />{t('customization.createTheme')}</Button>
      {creatingTheme && <div className="rounded-xl border border-border p-4 mb-4 space-y-3">
        <label className="customization-field"><span>{t('customization.themeName')}</span><input autoFocus value={customThemeName} maxLength={80} onChange={event => setCustomThemeName(event.target.value)} /></label>
        <label className="customization-field"><span>{t('customization.baseTheme')}</span><ThemedSelect value={customThemeBase} onChange={event => setCustomThemeBase(event.target.value)}>{availableThemes.map(id => <option key={id} value={id}>{availableInfo[id]?.name || id}</option>)}</ThemedSelect></label>
        <div className="flex gap-2"><Button size="sm" disabled={!customThemeName.trim()} onClick={createTheme}>{t('customization.create')}</Button><Button size="sm" variant="ghost" onClick={() => setCreatingTheme(false)}>{t('customization.cancel')}</Button></div>
      </div>}
      <label className="customization-field"><span>{t('customization.mode')}</span><ThemedSelect value={selected.mode} onChange={event => changeSelection({ mode: event.target.value as ThemeSelection['mode'] })}><option value="manual">{t('customization.manual')}</option><option value="system">{t('customization.system')}</option></ThemedSelect></label>
      <div className="mt-6 sm:mt-8">
      {selected.mode === 'system' ? <div className="customization-control-grid">{(['light', 'dark'] as const).map(mode => <label key={mode} className="customization-field"><span>{t(`customization.${mode}Palette`)}</span><ThemedSelect value={selected[mode === 'light' ? 'lightTheme' : 'darkTheme'] || (mode === 'light' ? 'light-minimal' : 'cherry-blossom')} onChange={event => changeSelection({ [mode === 'light' ? 'lightTheme' : 'darkTheme']: event.target.value })}>{availableThemes.filter(id => mode === 'light' ? !!resolveColors(id, draft.customThemes).isLight : !resolveColors(id, draft.customThemes).isLight).map(id => <option key={id} value={id}>{availableInfo[id]?.name || id}</option>)}</ThemedSelect></label>)}</div>
        : <ThemeSelector selectedTheme={selected.theme} customThemes={draft.customThemes} draftOverrides={draft.themes} onSelectTheme={id => { changeSelection({ theme: id }); setEditTheme(id); }} />}
      </div>
      {draft.customThemes?.[editTheme] && <div className="customization-editor-actions"><label className="customization-field flex-1"><span>{t('customization.themeName')}</span><input maxLength={80} value={draft.customThemes[editTheme]!.name} onChange={event => setDraft(current => ({ ...current, customThemes: { ...current.customThemes, [editTheme]: { ...current.customThemes![editTheme]!, name: event.target.value } } }))} /></label><Button size="sm" variant="ghost" onClick={deleteTheme}><Trash2 className="size-4" />{t('customization.deleteTheme')}</Button></div>}
    </SettingsSection>}
    {(tab === 'theme' || tab === 'cards' || tab === 'background') && <div className="customization-editor-columns" id={`customization-${tab}`} role="tabpanel">
      <div className="min-w-0 space-y-8">
        {tab === 'theme' && <><SettingsSection title={t('customization.logoTitle')} description={t('customization.logoDescription')}>
          <div className="customization-logo-options">{(['auto', 'light', 'dark', 'monochrome', 'legacy'] as LogoChoice[]).map(choice => <button type="button" key={choice} aria-pressed={(config.logo || 'auto') === choice} onClick={() => updateTheme({ logo: choice })} className={`customization-logo-option ${(config.logo || 'auto') === choice ? 'is-selected' : ''}`}><BrandLogo theme={editTheme} choice={choice} customThemes={draft.customThemes} className="size-10" /><span>{t(`customization.logos.${choice}`)}</span></button>)}</div>
        </SettingsSection>
        <details className="customization-advanced"><summary>{t('customization.palette')}</summary><Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(current => ({ ...current, themes: { ...current.themes, [editTheme]: null } })); setDesignId(''); }}><RotateCcw className="size-4" />{t('customization.resetTheme')}</Button><SettingsSection title={t('customization.palette')}>
          <div className="customization-palette-grid">{Object.entries(colors).filter(([, value]) => typeof value === 'string').map(([key, value]) => <label key={key} className="customization-palette-color"><input type="color" value={paletteHex(value as string)} onChange={event => updateTheme({ palette: { ...config.palette, [key]: paletteHsl(event.target.value) } })} /><span>{t(`customization.paletteTokens.${key}`, { defaultValue: key.replace(/([A-Z])/g, ' $1') })}</span></label>)}</div>
          <Button className="mt-3" size="sm" variant="ghost" onClick={() => updateTheme({ palette: null })}>{t('customization.resetPalette')}</Button>
        </SettingsSection>
        <MobileAppearanceSelector /></details></>}
        {tab === 'background' && <><SettingsSection title={t('customization.background')} description={t('customization.globalBackgroundDescription')}><BackgroundEditor value={config.background} onChange={background => updateTheme({ background })} /></SettingsSection><DesktopBackdropSelector /></>}
        {tab === 'cards' && <><SettingsSection title={t('customization.cardDesigns')} description={t('customization.cardDesignDescription')}>
          <div className="customization-editor-actions">
            <ThemedSelect aria-label={t('customization.cardDesigns')} value={design?.id || ''} onChange={event => { setDesignId(event.target.value); updateTarget({ activeDesign: event.target.value || null }); }}><option value="">{t('customization.originalDefault')}</option>{designs.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</ThemedSelect>
            <Button size="sm" variant="outline" onClick={() => addDesign()}><Plus className="size-4" />{t('customization.create')}</Button>
            <Button size="sm" variant="ghost" disabled={!design} onClick={() => design && addDesign(design)}><Copy className="size-4" />{t('customization.duplicate')}</Button>
            <Button size="sm" variant="ghost" disabled={!design} onClick={() => { if (!design) return; updateTarget({ designs: { ...targetConfig.designs, [design.id]: null }, activeDesign: targetConfig.activeDesign === design.id ? null : targetConfig.activeDesign }); setDesignId(''); }}><Trash2 className="size-4" />{t('customization.delete')}</Button>
          </div>
          {design && <><CardDesignEditor design={design} onChange={updateDesign} /><Button size="sm" variant="ghost" className="mt-3" onClick={() => updateDesign({ id: design.id, name: design.name, base: design.base })}>{t('customization.resetDesign')}</Button></>}
        </SettingsSection><details className="customization-advanced"><summary>{t('customization.originalStyles')}</summary><MediaCardStyleSelector /></details></>}
      </div>
      <div className="customization-preview-column"><div className="customization-preview" style={previewStyle} data-preview-target={target}>
        <AppearanceBackground background={config.background} className="customization-preview-background" />
        <div className="relative z-10"><div className="mb-6 flex items-center gap-3"><BrandLogo theme={editTheme} choice={config.logo || 'auto'} customThemes={draft.customThemes} className="size-10" /><div><strong>Tatakai</strong><p className="text-xs text-muted-foreground">{t('customization.livePreview')}</p></div></div>
          <CustomizationScopeProvider themeId={editTheme} target={target}><CardDesignPreviewProvider design={design || (targetConfig.activeDesign ? targetConfig.designs?.[targetConfig.activeDesign] : null)}><div className="mx-auto max-w-[280px]">
            {target === 'tv' ? <TVContentCard item={{ id: 'customization-preview', name: t('customization.previewTitle'), poster: '/assets/tv/wallpapers/1.png', rating: 8.9, type: 'TV', status: t('customization.previewStatus') }} /> : <UnifiedMediaCard item={{ id: 'customization-preview', name: t('customization.previewTitle'), poster: '/assets/tv/wallpapers/1.png', mediaType: 'anime', type: 'TV', status: t('customization.previewStatus'), rating: 8.9, year: 2026, episodes: { sub: 24, dub: 12 } }} rank={1} />}
          </div></CardDesignPreviewProvider></CustomizationScopeProvider>
        </div>
      </div><p className="mt-2 text-xs text-muted-foreground">{t('customization.previewHint')}</p></div>
    </div>}
    {tab === 'home' && <SettingsSection title={t('customization.homeSections')} description={t('customization.simpleHomeDescription')}><div className="customization-home-grid" id="customization-home" role="tabpanel">
      {([['animeHome', '/'], ['mangaHome', '/manga'], ['novelHome', '/novel']] as const).map(([key, path]) => <button type="button" key={key} disabled={dirty || saving} onClick={() => editPage(path)}><span><strong>{t(`customization.${key}`)}</strong><small>{t('customization.editLayout')}</small></span><ArrowRight className="size-5" /></button>)}
      <button type="button" disabled={dirty || saving} onClick={() => { closeSettings(); navigate('/custom-providers'); }}><span><strong>{t('customization.providerHomes')}</strong><small>{t('customization.chooseProvider')}</small></span><ArrowRight className="size-5" /></button>
    </div><div className="customization-home-hints"><span>{t('customization.reorder')}</span><span>{t('customization.hideSections')}</span><span>{t('customization.addSections')}</span></div></SettingsSection>}
    {tab === 'theme' && <details className="customization-advanced"><summary>{t('customization.launcherTitle')}</summary><LauncherIconSelector /></details>}
    {tab === 'sidebar' && <div id="customization-sidebar" role="tabpanel"><SidebarCustomizationEditor /></div>}
    {tab === 'spotlight' && <div id="customization-spotlight" role="tabpanel" style={previewStyle}><CustomizationScopeProvider themeId={editTheme} target={target}><SpotlightCustomizationEditor value={targetConfig.spotlight} onChange={spotlight => updateTarget({ spotlight })} target={target} themeId={editTheme} /></CustomizationScopeProvider></div>}
  </div></AppearanceDraftProvider>;
}
