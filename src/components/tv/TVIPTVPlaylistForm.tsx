export interface TVIPTVPlaylistValues {
  name: string;
  sourceKind: 'm3u' | 'xtream';
  url: string;
  username: string;
  password: string;
  epgURL: string;
}

interface Props {
  values: TVIPTVPlaylistValues;
  onChange(values: TVIPTVPlaylistValues): void;
  onImport(): void;
  onCancel(): void;
  busy: boolean;
  message: string;
}

/** Two ordinary buttons let a TV remote leave the source type with Up/Down. */
export function TVIPTVPlaylistForm({ values, onChange, onImport, onCancel, busy, message }: Props) {
  const update = (key: keyof TVIPTVPlaylistValues, value: string) => onChange({ ...values, [key]: value });
  return <>
    <div className="tv-iptv-playlist-fields">
      <label>Name<input id="tv-iptv-playlist-name" value={values.name} disabled={busy} onChange={event => update('name', event.target.value)} /></label>
      <fieldset className="tv-iptv-playlist-type">
        <legend>Type</legend>
        <div>
          {(['m3u', 'xtream'] as const).map(kind => <button type="button" key={kind} disabled={busy} aria-pressed={values.sourceKind === kind}
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const buttons = [...event.currentTarget.parentElement!.querySelectorAll('button')];
              const target = buttons[buttons.indexOf(event.currentTarget) + (event.key === 'ArrowRight' ? 1 : -1)];
              if (target) { event.currentTarget.tabIndex = -1; target.tabIndex = 0; target.focus(); }
            }} onClick={() => update('sourceKind', kind)}>{kind === 'm3u' ? 'M3U' : 'Xtream Codes'}</button>)}
        </div>
      </fieldset>
      <label>{values.sourceKind === 'm3u' ? 'Playlist URL' : 'Server URL'}<input type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={values.url} disabled={busy} onChange={event => update('url', event.target.value)} /></label>
      {values.sourceKind === 'xtream' && <>
        <label>Username<input autoCapitalize="none" autoCorrect="off" spellCheck={false} value={values.username} disabled={busy} onChange={event => update('username', event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="off" value={values.password} disabled={busy} onChange={event => update('password', event.target.value)} /></label>
      </>}
      <label>XMLTV guide URL (optional)<input type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={values.epgURL} disabled={busy} onChange={event => update('epgURL', event.target.value)} /></label>
    </div>
    <div className="tv-iptv-playlist-footer">
      <div className="tv-iptv-playlist-actions">
        <button type="button" className="tv-primary" disabled={busy || !values.url.trim()} onClick={onImport}>{busy ? 'Importing…' : 'Import'}</button>
        <button type="button" onClick={onCancel}>{busy ? 'Cancel import' : 'Cancel'}</button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  </>;
}
