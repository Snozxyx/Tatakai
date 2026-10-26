import { defaultEmpressConfig, EMPRESS_POSTER, readEmpressConfig } from './config';
import type { ThemeEditorProps } from '../types';
import './empress.css';
import './empress-cinematic.css';

export default function EmpressEditor({ configuration, onChange }: ThemeEditorProps) {
  const config = readEmpressConfig(configuration) ?? defaultEmpressConfig();
  return <section className="ge-editor" aria-label="Gothic Empress settings"><img src={EMPRESS_POSTER} alt="Gothic Empress wallpaper with a black crown and glowing red eye" /><div><span className="ge-eyebrow">YOUR COURT, YOUR ATMOSPHERE</span><h3>Gothic Empress</h3><p>The original wallpaper, framed in obsidian and crimson. Your identity and collections fill the court.</p><label className="ge-editor-motion"><input type="checkbox" checked={config.motion} onChange={e => onChange({ ...config, motion: e.target.checked })} />Animate wallpaper & sigil</label><label>Ember intensity · {Math.round(config.embers * 100)}%<input type="range" min="0" max="100" step="5" value={config.embers * 100} onChange={e => onChange({ ...config, embers: Number(e.target.value) / 100 })} /></label><small>Reduced motion and data saver automatically use the still artwork.</small></div></section>;
}

