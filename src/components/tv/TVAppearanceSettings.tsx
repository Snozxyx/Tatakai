import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { useState } from "react";
import { Check } from "lucide-react";
import { saveTVAppearance, useTVAppearance } from "@/core/tv/appearance";
import { DEFAULT_TV_THEME, TV_THEMES, tvThemeInfo } from "@/core/tv/themes";

export function TVAppearanceSettings() {
  const { appearance, reduced } = useTVAppearance();
  const [message, setMessage] = useState('');
  return <section className="tv-appearance-settings">
    <h2>Themes & appearance</h2>
    <p>Choose the colors for your TV. Cherry Blossom is the default.</p>
    <div className="tv-theme-options" aria-label="TV themes">
      {TV_THEMES.map(theme => {
        const { name, colors } = tvThemeInfo(theme);
        const selected = appearance.theme === theme;
        return <button key={theme} className="tv-theme-option" data-tv-key={`theme-${theme}`}
          aria-pressed={selected} onClick={() => {
            saveTVAppearance({ ...appearance, theme });
            setMessage(`${name} selected.`);
          }}>
          <span className="tv-theme-preview" style={{ background: `hsl(${colors.background})`, borderColor: `hsl(${colors.border})` }} aria-hidden="true">
            <span className="tv-theme-preview-sidebar" style={{ background: `hsl(${colors.sidebarBackground})` }}><i style={{ background: `hsl(${colors.primary})` }} /></span>
            <span className="tv-theme-preview-content"><i style={{ background: `hsl(${colors.primary})` }} /><span><i style={{ background: `hsl(${colors.card})` }} /><i style={{ background: `hsl(${colors.card})` }} /><i style={{ background: `hsl(${colors.card})` }} /></span></span>
          </span>
          <span className="tv-theme-label"><strong>{name}</strong>{selected && <Check aria-label="Active" />}</span>
          <small>{theme === DEFAULT_TV_THEME ? 'Default · Soft sakura pink' : tvThemeInfo(theme).description}</small>
        </button>;
      })}
    </div>
    <label className="tv-setting-row"><span><strong>Title previews</strong><small>Play muted previews after focusing a title. Availability depends on the title.</small></span><ThemedCheckbox type="checkbox" checked={appearance.previews} onChange={event => saveTVAppearance({ ...appearance, previews: event.target.checked })} /></label>
    {reduced && <p>Reduced motion is active. Automatic title previews are paused.</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
