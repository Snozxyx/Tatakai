import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Grip, X } from 'lucide-react';

export interface ProfileYouTubePlayer {
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void; unMute(): void; setVolume(volume: number): void;
  getCurrentTime(): number; getDuration(): number; destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface PlayerOptions {
  width: number; height: number; videoId: string; host: string;
  playerVars: Record<string, string | number>;
  events: { onReady: (event: { target: ProfileYouTubePlayer }) => void; onStateChange: (event: { data: number }) => void; onError: (event: { data: number }) => void; onAutoplayBlocked: () => void };
}
interface YouTubeAPI { Player: new (element: HTMLElement, options: PlayerOptions) => ProfileYouTubePlayer }
type PlayerWindow = Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeAPI> | null = null;
function youtubeAPI(): Promise<YouTubeAPI> {
  const browser = window as PlayerWindow;
  if (browser.YT?.Player) return Promise.resolve(browser.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const previous = browser.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => { apiPromise = null; script.remove(); browser.onYouTubeIframeAPIReady = previous; reject(new Error('YouTube did not load. Check your connection and retry.')); }, 15000);
    browser.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); browser.onYouTubeIframeAPIReady = previous; previous?.(); if (browser.YT) resolve(browser.YT); else { apiPromise = null; reject(new Error('YouTube is unavailable.')); } };
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
    script.onerror = () => { clearTimeout(timeout); apiPromise = null; browser.onYouTubeIframeAPIReady = previous; script.remove(); reject(new Error('YouTube could not load. Please retry.')); };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function SekaiYouTube({ videoId, volume, onReady, onPlaying, onTime, onError, onClose }: {
  videoId: string; volume: number; onReady: (player: ProfileYouTubePlayer | null) => void;
  onPlaying: (playing: boolean) => void; onTime: (time: number, duration: number) => void;
  onError: (message: string) => void; onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  const bounded = useCallback((x: number, y: number) => {
    const width = panel.current?.offsetWidth || 360; const height = panel.current?.offsetHeight || 250;
    const frame = panel.current?.closest<HTMLElement>('.sp-profile')?.getBoundingClientRect();
    const left = Math.max(10, (frame?.left || 0) + 10); const top = Math.max(10, (frame?.top || 0) + 10);
    return { x: Math.max(left, Math.min(Math.min(window.innerWidth, frame?.right ?? window.innerWidth) - width - 10, x)), y: Math.max(top, Math.min(Math.min(window.innerHeight, frame?.bottom ?? window.innerHeight) - height - 10, y)) };
  }, []);
  const movePlayer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !panel.current) return;
    event.preventDefault(); dragCleanup.current?.();
    const rect = panel.current.getBoundingClientRect(); const x = event.clientX; const y = event.clientY;
    setPosition(bounded(rect.left, rect.top)); setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => { if (next.pointerId === event.pointerId) setPosition(bounded(rect.left + next.clientX - x, rect.top + next.clientY - y)); };
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); dragCleanup.current = null; };
    const end = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) return; cleanup(); setDragging(false); };
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  };
  useEffect(() => {
    const resize = () => setPosition(current => current ? bounded(current.x, current.y) : current);
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); dragCleanup.current?.(); };
  }, [bounded]);
  const callbacks = useRef({ onReady, onPlaying, onTime, onError });
  callbacks.current = { onReady, onPlaying, onTime, onError };
  useEffect(() => {
    let cancelled = false; let player: ProfileYouTubePlayer | null = null; let timer: number | undefined;
    const element = document.createElement('div'); host.current?.appendChild(element);
    void youtubeAPI().then(api => {
      if (cancelled) return;
      player = new api.Player(element, { width: 360, height: 203, videoId, host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, controls: 1, rel: 0, ...(window.location.protocol.startsWith('http') ? { origin: window.location.origin } : {}) },
        events: {
          onReady: ({ target }) => { if (cancelled) return; target.getIframe().referrerPolicy = 'strict-origin-when-cross-origin'; target.setVolume(Math.round(volume * 100)); callbacks.current.onReady(target); target.playVideo(); timer = window.setInterval(() => { if (!cancelled && player) callbacks.current.onTime(player.getCurrentTime(), player.getDuration()); }, 250); },
          onStateChange: ({ data }) => { if (!cancelled && [0, 1, 2, 5].includes(data)) callbacks.current.onPlaying(data === 1); },
          onError: ({ data }) => { if (cancelled) return; callbacks.current.onPlaying(false); callbacks.current.onError([101, 150].includes(data) ? 'This video cannot be embedded. Choose another upload or open it on YouTube.' : 'YouTube could not play this video. Try its player controls or open it on YouTube.'); },
          onAutoplayBlocked: () => { if (!cancelled) callbacks.current.onError('Press Play in the YouTube player to start this track.'); },
        },
      });
    }).catch(error => { if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : 'YouTube is unavailable.'); });
    return () => { cancelled = true; clearInterval(timer); callbacks.current.onReady(null); player?.destroy(); element.remove(); };
    // Volume changes use the controller without rebuilding the video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  return <aside ref={panel} className="sp-youtube-panel" data-dragging={dragging} aria-label="YouTube music player" style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}><header><button type="button" className="sp-youtube-drag" aria-label="Move YouTube player; drag or use arrow keys" onPointerDown={movePlayer} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !panel.current) return;
    event.preventDefault(); const rect = panel.current.getBoundingClientRect(); const amount = event.shiftKey ? 30 : 10;
    setPosition(bounded(rect.left + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), rect.top + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0)));
  }}><Grip size={16} /><span>Move</span></button><a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">YouTube</a><button type="button" aria-label="Close YouTube player and stop music" onClick={onClose}><X size={14} /></button></header><div className="sp-youtube-video" ref={host} />{dragging && <div className="sp-youtube-drag-shield" />}</aside>;
}
