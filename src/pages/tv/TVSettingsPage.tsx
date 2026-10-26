import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TVAppearanceSettings } from "@/components/tv/TVAppearanceSettings";
import { DebridSettingsPanel } from "@/components/settings/DebridSettingsPanel";
import { useTVAppearance, saveTVAppearance } from "@/core/tv/appearance";
import { useVideoSettings } from "@/hooks/media/useVideoSettings";
import { useAuth } from "@/contexts/AuthContext";
import { getTVDeviceInfo } from "@/core/tv/device";
import { TVPairingModal } from "./TVPairingModal";
const PANELS = [['appearance', 'Themes & appearance'], ['playback', 'TV playback'], ['accessibility', 'Remote & accessibility'], ['accounts', 'Accounts & debrid'], ['library', 'Downloads & sources'], ['about', 'About this TV']] as const;
export default function TVSettingsPage() {
  const [params, setParams] = useSearchParams();
  const selected = PANELS.some(([id]) => id === params.get('panel')) ? params.get('panel') : 'appearance';
  const { appearance } = useTVAppearance();
  const { settings, updateSetting } = useVideoSettings();
  const { user, profile, signOut } = useAuth();
  const [pairing, setPairing] = useState(false);
  const [refresh, setRefresh] = useState(localStorage.getItem('tatakai-tv-disruptive-refresh') === 'true');
  const device = getTVDeviceInfo();
  return <div className="tv-page tv-device-settings">
    <h1>TV settings</h1><p>Your screen. Your remote. Your Tatakai.</p>
    <div className="tv-two-column">
      <nav className="tv-side-menu" aria-label="TV settings categories">{PANELS.map(([id, label]) => <button key={id} data-tv-key={`tv-settings-${id}`} aria-pressed={selected === id} onClick={() => setParams({ panel: id }, { replace: true })}>{label}</button>)}</nav>
      <section className="tv-settings-content" aria-label={PANELS.find(([id]) => id === selected)?.[1]}>
        {selected === 'appearance' && <TVAppearanceSettings />}
        {selected === 'playback' && <>
          <h2>TV playback</h2><p>Native decoding, remote controls, and settings built for the living room.</p>
          <label className="tv-setting-row"><span><strong>Play the next episode</strong><small>Continue automatically when an episode finishes.</small></span><ThemedCheckbox type="checkbox" checked={settings.autoNextEpisode} onChange={event => updateSetting('autoNextEpisode', event.target.checked)} /></label>
          <label className="tv-setting-row"><span><strong>Subtitle language</strong><small>Used when the selected server provides this language.</small></span><ThemedSelect value={settings.subtitleLanguage} onChange={event => updateSetting('subtitleLanguage', event.target.value)}>{[['auto', 'Automatic'], ['off', 'Off'], ['english', 'English'], ['japanese', 'Japanese'], ['spanish', 'Spanish'], ['hindi', 'Hindi'], ['french', 'French'], ['german', 'German'], ['arabic', 'Arabic'], ['portuguese', 'Portuguese'], ['korean', 'Korean'], ['chinese', 'Chinese']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</ThemedSelect></label>
          <label className="tv-setting-row"><span><strong>Allow display refresh switching</strong><small>May briefly blank the screen. Seamless matching is used when this is off.</small></span><ThemedCheckbox type="checkbox" checked={refresh} onChange={event => { setRefresh(event.target.checked); localStorage.setItem('tatakai-tv-disruptive-refresh', String(event.target.checked)); }} /></label>
          <div className="tv-settings-note"><h3>Fine-tune while watching</h3><p>Open the player’s Settings drawer for playback speed, video quality, picture size, and subtitle size. Audio and Servers have their own shortcuts.</p></div>
        </>}
        {selected === 'accessibility' && <>
          <h2>Remote & accessibility</h2>
          <label className="tv-setting-row"><span><strong>Reduce motion</strong><small>Pause automatic title previews and reduce interface motion. Your device’s reduced-motion setting is also respected.</small></span><ThemedCheckbox type="checkbox" checked={appearance.reducedMotion} onChange={event => saveTVAppearance({ ...appearance, reducedMotion: event.target.checked })} /></label>
          <dl className="tv-remote-guide"><div><dt>D-Pad</dt><dd>Move between cards, menus and controls.</dd></div><div><dt>Select</dt><dd>Open the focused item or change its setting.</dd></div><div><dt>Back</dt><dd>Close a drawer or return to the previous screen.</dd></div><div><dt>In the player</dt><dd>Up reveals controls, Down reveals episodes. Left and Right on the timeline seek.</dd></div></dl>
        </>}
        {selected === 'accounts' && <><h2>Accounts & debrid</h2><p>{user ? `Signed in as ${profile?.display_name || profile?.username || 'your account'}.` : 'Pair with your phone to sign in and transfer your selected setup.'}</p><div className="tv-actions"><button onClick={() => setPairing(true)}>{user ? 'Sync a companion device' : 'Link account'}</button>{user && <button onClick={() => void signOut()}>Sign out on this TV</button>}</div><DebridSettingsPanel /></>}
        {selected === 'library' && <><h2>Downloads & sources</h2><p>Manage offline content, providers and experimental live TV.</p><div className="tv-library-links"><Link to="/downloads">Downloads & offline library</Link><Link to="/extensions">Extensions & servers</Link><Link to="/tv/iptv">IPTV & guide · Experimental</Link></div></>}
        {selected === 'about' && <><h2>Tatakai for TV</h2><p>Dedicated Android / Google TV application.</p><dl className="tv-remote-guide"><div><dt>App</dt><dd>app.tatakai.me.tv</dd></div>{device.apiLevel && <div><dt>Android API</dt><dd>{device.apiLevel}</dd></div>}<div><dt>Playback</dt><dd>Media3 native player. HDR and audio output depend on your TV and connected devices.</dd></div></dl><div className="tv-actions"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div></>}
      </section>
    </div><TVPairingModal open={pairing} onClose={() => setPairing(false)} />
  </div>;
}
