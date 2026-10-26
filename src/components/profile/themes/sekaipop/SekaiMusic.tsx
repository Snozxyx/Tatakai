import { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { parseProfileLyrics, profileYouTubeId } from '@/lib/profileThemeMusic';
import { sekaiMascotUrl, type SekaiConfig } from '@/lib/profileThemes';
import { SekaiYouTube, type ProfileYouTubePlayer } from './SekaiYouTube';

export function SekaiMusic({ music, mascot, isOwner, onEdit, onAutoplayChange }: { music: SekaiConfig['music']; mascot: SekaiConfig['mascot']; isOwner: boolean; onEdit: () => void; onAutoplayChange?: (enabled: boolean) => Promise<void> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [showYouTube, setShowYouTube] = useState(false);
  const hiddenForVisit = useRef(false);
  const youtube = useRef<ProfileYouTubePlayer | null>(null);
  const videoId = profileYouTubeId(music.url);
  const ownerPreference = useRef(music.autoplay);
  useEffect(() => { ownerPreference.current = music.autoplay; }, [music.autoplay, music.url]);
  const rememberPlayback = (enabled: boolean) => {
    if (!isOwner || !onAutoplayChange || ownerPreference.current === enabled) return;
    const previous = ownerPreference.current; ownerPreference.current = enabled;
    void onAutoplayChange(enabled).catch(() => { ownerPreference.current = previous; setError('Music is playing locally, but its arrival preference could not be saved. Use Music settings to retry.'); });
  };
  const lyrics = useMemo(() => parseProfileLyrics(music.lyrics), [music.lyrics]);
  const active = lyrics.reduce((current, line, index) => line.time <= time ? index : current, -1);
  useEffect(() => { if (audio.current) audio.current.volume = music.volume; youtube.current?.setVolume(Math.round(music.volume * 100)); }, [music.volume, music.url]);
  useEffect(() => { hiddenForVisit.current = false; setPlaying(false); setTime(0); setDuration(0); setError(''); setShowYouTube(false); setMuted(false); }, [music.url]);
  useEffect(() => {
    if (!music.autoplay || !music.url) return;
    let attempted = false;
    const start = () => {
      if (attempted || hiddenForVisit.current || document.visibilityState === 'hidden') return;
      attempted = true;
      if (videoId) setShowYouTube(true);
      else void audio.current?.play().catch(() => setError('Your browser needs a tap before music can start. Press Play to listen.'));
    };
    start(); document.addEventListener('visibilitychange', start);
    return () => document.removeEventListener('visibilitychange', start);
  }, [music.autoplay, music.url, videoId]);
  const hideYouTube = () => { hiddenForVisit.current = true; youtube.current?.pauseVideo(); setPlaying(false); setShowYouTube(false); };
  const toggle = async () => {
    if (videoId) { if (!showYouTube) { hiddenForVisit.current = false; setError(''); setShowYouTube(true); return; } if (playing) { youtube.current?.pauseVideo(); rememberPlayback(false); } else youtube.current?.playVideo(); return; }
    const element = audio.current; if (!element) return;
    if (!element.paused) { element.pause(); rememberPlayback(false); return; }
    try { setError(''); await element.play(); }
    catch { setError('This track could not play. Use a direct public MP3, OGG, WAV, or M4A link.'); }
  };
  const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return <section className="sp-music-dock" aria-label="Profile music" data-playing={playing}>
    {mascot.enabled && <img className="sp-music-mascot" src={sekaiMascotUrl(playing ? mascot.key : 'sleepy')} alt="" loading="lazy" />}
    {music.url && !videoId && <audio ref={audio} src={music.url} preload="none" onPlay={() => { setPlaying(true); rememberPlayback(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onError={() => { setPlaying(false); setError('Audio could not load. Check that the music link points directly to a public audio file.'); }} />}
    {videoId && showYouTube && <SekaiYouTube videoId={videoId} volume={music.volume} onReady={player => { youtube.current = player; }} onPlaying={next => { setPlaying(next); if (next) rememberPlayback(true); }} onTime={(position, length) => { setTime(Number.isFinite(position) ? position : 0); setDuration(Number.isFinite(length) ? length : 0); }} onError={setError} onClose={hideYouTube} />}
    <div className="sp-music-track"><span className="sp-music-disc"><Music2 size={20} /></span><div><strong>{music.title || (music.url ? 'Profile soundtrack' : 'A soundtrack for this little world')}</strong><span>{music.artist || (music.url ? 'Press play to listen' : 'Music starts only when you choose to play')}</span></div></div>
    {music.url ? <>
      <button type="button" className="sp-music-play" aria-label={playing ? 'Pause profile music' : 'Play profile music'} onClick={() => void toggle()}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
      <div className="sp-music-progress"><label><span className="sr-only">Playback position</span><input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration || 1)} disabled={!duration} onChange={e => { const position = Number(e.target.value); if (videoId) youtube.current?.seekTo(position, true); else if (audio.current) audio.current.currentTime = position; setTime(position); }} /></label><span>{stamp(time)} / {stamp(duration)}</span></div>
      <button type="button" aria-label={muted ? 'Unmute music' : 'Mute music'} onClick={() => { if (audio.current) audio.current.muted = !muted; if (youtube.current) { if (muted) youtube.current.unMute(); else youtube.current.mute(); } setMuted(!muted); }}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
      {videoId && <button type="button" className="sp-video-visibility" aria-pressed={showYouTube} onClick={() => { if (showYouTube) hideYouTube(); else { hiddenForVisit.current = false; setError(''); setShowYouTube(true); } }}>{showYouTube ? 'Hide video' : 'Show video'}</button>}
      <div className="sp-lyrics" aria-label="Song lyrics"><span>{lyrics[active - 1]?.text || ''}</span><strong key={active}>{lyrics[active]?.text || (lyrics.length ? 'The next line is on its way…' : music.lyrics ? music.lyrics.split(/\r?\n/).find(line => line.trim()) : 'Lyrics are not available for this track')}</strong><span>{lyrics[active + 1]?.text || (music.lyrics && !lyrics.length ? 'Untimed lyrics' : '')}</span>{music.lyrics && !lyrics.length && <details className="sp-plain-lyrics"><summary>Read lyrics</summary><p>{music.lyrics}</p></details>}</div>
    </> : <span className="sp-music-empty">Your world can have a song, too.</span>}
    {isOwner && <button type="button" className="sp-music-edit" onClick={onEdit}>{music.url ? 'Edit music' : 'Add music'}</button>}
    {error && <p className="sp-music-error" role="alert">{error}</p>}
  </section>;
}
