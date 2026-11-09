import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { saveTVAppearance, useTVAppearance } from '@/core/tv/appearance';
import { useTheme, useSystemDark, resolveColors } from '@/hooks/ui/useTheme';
import { useCustomization } from '@/hooks/ui/useCustomization';
import { getTargetCustomization, type ThemeSelection, type ThemeCustomization } from '@/lib/customization';
import { normalizeThemeSelection, resolveThemeSelection } from '@/lib/themeSelection';
import { LauncherIconSelector } from '@/components/settings/LauncherIconSelector';

export function TVAppearanceSettings() {
  const { t } = useTranslation();
  const { appearance, reduced } = useTVAppearance();
  const { themes, themeInfo } = useTheme();
  const { settings, savePatch } = useCustomization();
  const systemDark = useSystemDark();
  const committed = normalizeThemeSelection(settings.tvSelection ?? { mode: 'manual', theme: appearance.theme });
  const [draft, setDraft] = useState<ThemeSelection>(committed);
  const [designs, setDesigns] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const committedKey = JSON.stringify(committed);
  const dirty = JSON.stringify(normalizeThemeSelection(draft)) !== committedKey || Object.entries(designs).some(([id, design]) => (getTargetCustomization(settings, id, 'tv').activeDesign ?? null) !== design);
  useEffect(() => { if (!dirty) { setDraft(committed); setDesigns({}); } }, [committedKey, dirty]);
  const selectedTheme = resolveThemeSelection(draft, systemDark);
  const target = getTargetCustomization(settings, selectedTheme, 'tv');
  const activeDesign = Object.prototype.hasOwnProperty.call(designs, selectedTheme) ? designs[selectedTheme] : target.activeDesign;
  const availableDesigns = Object.values(target.designs || {}).filter(Boolean);
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const changedThemes: Record<string, ThemeCustomization> = {};
      for (const [id, activeDesign] of Object.entries(designs)) if ((getTargetCustomization(settings, id, 'tv').activeDesign ?? null) !== activeDesign) changedThemes[id] = { targets: { tv: { activeDesign } } };
      await savePatch({ tvSelection: normalizeThemeSelection(draft), themes: changedThemes });
      setDesigns({}); setMessage(t('customization.saved'));
    } catch { setMessage(t('customization.saveFailed')); }
    finally { setSaving(false); }
  };
  return <section className="tv-appearance-settings">
    <h2>{t('customization.homeSections')}</h2><p>{t('customization.homeDescription')}</p>
    <div className="tv-actions">{[['/', 'animeHome'], ['/manga', 'mangaHome'], ['/novel', 'novelHome']].map(([path, label]) => <Link key={path} to={`${path}?customize=1&customizationTarget=tv&customizationTheme=${encodeURIComponent(appearance.theme)}`}>{t(`customization.${label}`)}</Link>)}</div>
    <h3>{t('customization.activeAppearance')}</h3><p>{t('customization.tvIndependent')}</p>
    <label className="tv-setting-row"><span>{t('customization.mode')}</span><ThemedSelect value={draft.mode} onChange={event => setDraft(current => ({ ...current, mode: event.target.value as ThemeSelection['mode'] }))}><option value="manual">{t('customization.manual')}</option><option value="system">{t('customization.system')}</option></ThemedSelect></label>
    {draft.mode === 'system' ? <div className="tv-theme-options">{(['light', 'dark'] as const).map(mode => <label key={mode} className="tv-setting-row"><span>{t(`customization.${mode}Palette`)}</span><ThemedSelect value={draft[mode === 'light' ? 'lightTheme' : 'darkTheme']} onChange={event => setDraft(current => ({ ...current, [mode === 'light' ? 'lightTheme' : 'darkTheme']: event.target.value }))}>{themes.filter(id => mode === 'light' ? !!resolveColors(id).isLight : !resolveColors(id).isLight).map(id => <option key={id} value={id}>{themeInfo[id]?.name || id}</option>)}</ThemedSelect></label>)}</div> : <label className="tv-setting-row"><span>{t('customization.editTheme')}</span><ThemedSelect value={draft.theme} onChange={event => setDraft(current => ({ ...current, theme: event.target.value }))}>{themes.map(id => <option key={id} value={id}>{themeInfo[id]?.name || id}</option>)}</ThemedSelect></label>}
    <details><summary>{t('customization.cardDesigns')}</summary><label className="tv-setting-row"><span>{t('customization.defaultDesign')}</span><ThemedSelect value={activeDesign || ''} onChange={event => setDesigns(current => ({ ...current, [selectedTheme]: event.target.value || null }))}><option value="">{t('customization.originalDefault')}</option>{availableDesigns.map(design => design && <option key={design.id} value={design.id}>{design.name}</option>)}</ThemedSelect></label></details>
    <div className="tv-actions"><button disabled={!dirty || saving} onClick={() => void save()}>{t('customization.save')}</button><button disabled={!dirty || saving} onClick={() => { setDraft(committed); setDesigns({}); setMessage(t('customization.cancelled')); }}>{t('customization.cancel')}</button></div>
    <label className="tv-setting-row"><span><strong>Title previews</strong><small>Play muted previews after focusing a title. Availability depends on the title.</small></span><ThemedCheckbox type="checkbox" checked={appearance.previews} onChange={event => saveTVAppearance({ ...appearance, previews: event.target.checked })} /></label>
    {reduced && <p>Reduced motion is active. Automatic title previews are paused.</p>}
    <p role="status" aria-live="polite">{message}</p><details><summary>{t('customization.launcherTitle')}</summary><LauncherIconSelector /></details>
  </section>;
}
