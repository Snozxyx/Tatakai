import { useState, useRef, useEffect, useCallback } from "react";

import {

  Play,

  Pause,

  Volume2,

  VolumeX,

  Maximize,

  Minimize,

  SkipBack,

  SkipForward,
  Settings,
  Subtitles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Upload, // New icon for upload
  SlidersHorizontal,
  FastForward,
  Eye,
  List,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Download,
  DownloadCloud,
  PictureInPicture2,
} from "lucide-react";

import Hls from "hls.js";

import { toast } from "sonner";

import { useVideoSettings } from "@/hooks/useVideoSettings";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { useDownload } from "@/hooks/useDownload";

import { VideoSettingsPanel } from "./VideoSettingsPanel";

import { useAniskip } from "@/hooks/useAniskip";

import { getProxiedImageUrl, getProxiedVideoUrl, getProxiedSubtitleUrl, trackEvent } from "@/lib/api";

// Helper function to convert local file paths to file:// URLs
function convertFileSrc(filePath: string): string {
  if (!filePath) return filePath;
  // Already a proper URL
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('file://')) {
    return filePath;
  }
  // Convert Windows path to file:// URL
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized}`;
}



interface VideoPlayerProps {

  sources: Array<{ url: string; isM3U8: boolean; quality?: string }>;

  subtitles?: Array<{ lang: string; url: string; label?: string }>;

  headers?: { Referer?: string; "User-Agent"?: string };

  poster?: string;

  onError?: () => void;

  onServerSwitch?: () => void;

  isLoading?: boolean;

  serverName?: string;

  onEpisodeEnd?: () => void;

  malId?: number | null;

  episodeNumber?: number;

  initialSeekSeconds?: number;

  viewCount?: number;

  isLive?: boolean;

}



// Replaced by centralized functions in api.ts



function formatTime(seconds: number): string {

  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";

  const mins = Math.floor(seconds / 60);

  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;

}



export function VideoPlayer({

  sources,

  subtitles = [],

  headers,

  poster,

  onError,

  onServerSwitch,

  isLoading = false,

  serverName,

  onEpisodeEnd,

  malId,

  episodeNumber,

  viewCount,

  // optional progress callback provided by parent (watch page)

  onProgressUpdate,

  animeId,

  animeName,

  animePoster,

  episodeId,

  initialSeekSeconds,

  externalRef,

  onPlay,

  onPause,

  isLive,

  episodeTitle,

  isOffline

}: VideoPlayerProps & {

  onProgressUpdate?: (progressSeconds: number, durationSeconds?: number, completed?: boolean) => void;

  animeId?: string;

  animeName?: string;

  animePoster?: string;

  episodeId?: string;

  initialSeekSeconds?: number;

  externalRef?: React.MutableRefObject<HTMLVideoElement | null>;

  onPlay?: () => void;

  onPause?: () => void;

  isLive?: boolean;

  episodeTitle?: string;

  isOffline?: boolean;

}) {

  const videoRef = useRef<HTMLVideoElement>(null);



  // Sync external ref

  useEffect(() => {

    if (externalRef) {

      externalRef.current = videoRef.current;

    }

  }, [externalRef]);



  const containerRef = useRef<HTMLDivElement>(null);

  const hlsRef = useRef<Hls | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);



  const { settings } = useVideoSettings();

  const { skipTimes, fetchSkipTimes, getActiveSkip, getSkipLabel } = useAniskip();



  const resolvedPoster = poster ? getProxiedImageUrl(poster) : undefined;



  const [isPlaying, setIsPlaying] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [lastSavedProgress, setLastSavedProgress] = useState(0);

  const lastSavedProgressRef = useRef<number>(0);

  const progressIntervalRef = useRef<number | null>(null);

  const PROGRESS_SAVE_INTERVAL = 15; // seconds

  const [volume, setVolume] = useState(settings.volume);

  const [isMuted, setIsMuted] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);

  const [showControls, setShowControls] = useState(true);

  const [buffered, setBuffered] = useState(0);

  const [videoError, setVideoError] = useState<string | null>(null);

  const [isBuffering, setIsBuffering] = useState(false);

  const [retryCount, setRetryCount] = useState(0);

  const [showSettings, setShowSettings] = useState(false);

  const [playbackRate, setPlaybackRate] = useState(settings.playbackSpeed);

  const [isMobile, setIsMobile] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState<string>(settings.subtitleLanguage);

  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [customSubtitles, setCustomSubtitles] = useState<Array<{ lang: string; url: string; label: string }>>([]);
  const [subtitleBlobs, setSubtitleBlobs] = useState<Record<string, string>>({});
  const [activeSkip, setActiveSkip] = useState<any>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, any>>({});
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const isNative = useIsNativeApp();
  const { startDownload, downloadStates } = useDownload();

  const handleCustomSubtitleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const newSub = {
      lang: 'custom',
      url: url,
      label: file.name
    };

    setCustomSubtitles(prev => [...prev, newSub]);

    // Also add to blobs map immediately so it renders
    setSubtitleBlobs(prev => ({ ...prev, [url]: url }));

    // Select it
    handleSubtitleChange('custom');
    toast.success(`Loaded subtitle: ${file.name}`);
  };



  // Keep a stable ref to the latest progress callback to avoid effect churn

  const progressCallbackRef = useRef<typeof onProgressUpdate | null>(onProgressUpdate);



  const currentSource = sources[0];



  const initialSeekDoneRef = useRef(false);

  const manifestFallbackRef = useRef(false);

  const initialSeekRef = useRef(initialSeekSeconds);



  // Keep initialSeekRef fresh so manifest handlers see the latest value without triggering reload

  useEffect(() => {

    if (initialSeekSeconds !== undefined && !initialSeekDoneRef.current) {

      initialSeekRef.current = initialSeekSeconds;

    }

  }, [initialSeekSeconds]);






  // Apply video settings in real-time when they change

  useEffect(() => {

    if (videoRef.current) {

      videoRef.current.playbackRate = settings.playbackSpeed;

      setPlaybackRate(settings.playbackSpeed);

    }

  }, [settings.playbackSpeed]);



  useEffect(() => {
    if (videoRef.current && !isMuted) {
      videoRef.current.volume = settings.volume;
      setVolume(settings.volume);
    }
  }, [settings.volume]);

  // Sync with Discord RPC
  const lastRpcUpdateRef = useRef(0);
  useEffect(() => {
    if (isNative && (window as any).electron && animeName) {
      const now = Date.now();
      if (now - lastRpcUpdateRef.current < 5000) return; // Throttle 5s
      lastRpcUpdateRef.current = now;

      const extra: any = {
        startTime: isPlaying ? new Date(Date.now() - currentTime * 1000) : undefined,
        endTime: isPlaying && duration > 0 ? new Date(Date.now() + (duration - currentTime) * 1000) : undefined,
        smallImageKey: isPlaying ? 'play_icon' : 'pause_icon',
        smallImageText: isPlaying ? 'Playing' : 'Paused'
      };

      (window as any).electron.updateRPC({
        details: `Watching ${animeName}`,
        state: `Episode ${episodeNumber || '...'}`,
        extra
      });
    }
  }, [isNative, isPlaying, animeName, episodeNumber, currentTime, duration]);



  const handleSubtitleChange = useCallback((lang: string) => {

    const video = videoRef.current;

    if (!video) return;



    const tracks = video.textTracks;

    console.log('[VideoPlayer] Applying subtitle:', lang, 'Tracks:', tracks.length);



    for (let i = 0; i < tracks.length; i++) {

      const track = tracks[i];

      const trackLang = (track.language || '').toLowerCase();

      const trackLabel = (track.label || '').toLowerCase();



      // Reset first

      track.mode = 'disabled';



      if (lang === 'off') {

        // Already disabled

      } else if (lang === 'auto') {

        // Auto: prefer English

        if (trackLang === 'en' || trackLang.includes('eng') || trackLabel.includes('english') || i === 0) {

          track.mode = 'showing';

        }

      } else {

        const target = lang.toLowerCase();

        if (

          trackLang === target ||

          trackLabel.includes(target) ||

          target.includes(trackLang && trackLang.length > 1 ? trackLang : '___never___')

        ) {

          track.mode = 'showing';

        }

      }

    }

    setCurrentSubtitle(lang);

  }, []);



  useEffect(() => {

    handleSubtitleChange(settings.subtitleLanguage);

  }, [settings.subtitleLanguage, handleSubtitleChange]);



  // Create a key from subtitle URLs to detect changes

  const subtitleKey = subtitles?.map(s => s.url).join('|') ?? '';

  const headersKey = JSON.stringify(headers || {});



  // Prefetch subtitles to ensure CORS and headers are applied correctly

  // Also clear old blobs when subtitles change (e.g., switching between sub/dub)

  useEffect(() => {

    if (!subtitles || subtitles.length === 0) {

      // Clear blobs if no subtitles

      setSubtitleBlobs({});

      return;

    }



    let mounted = true;



    // Clear existing blobs and refetch when subtitle sources change

    setSubtitleBlobs({});



    (async () => {

      const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const newBlobs: Record<string, string> = {};



      for (const sub of subtitles) {

        if (!mounted) break;

        try {
          // Check if local asset
          const isLocalSub = sub.url.startsWith('asset://') || sub.url.includes('asset.localhost');

          if (isLocalSub) {
            if (mounted) setSubtitleBlobs(prev => ({ ...prev, [sub.url]: sub.url }));
            continue;
          }

          const res = await fetch(sub.url, {

            headers: {

              Accept: 'text/vtt, text/plain, */*',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://megacloud.blog/',
              'Origin': 'https://megacloud.blog'

            }

          });

          if (res.ok) {

            let text = await res.text();



            // Basic SRT to VTT conversion

            if (!text.trim().startsWith('WEBVTT')) {

              console.log('[VideoPlayer] Normalizing subtitle format for:', sub.lang);

              // If it has SRT timestamps (00:00:00,000)

              if (text.includes('-->')) {

                // Convert commas to dots for timestamps

                text = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

                // Ensure WEBVTT header

                if (!text.includes('WEBVTT')) {

                  text = 'WEBVTT\n\n' + text;

                }

              } else {

                // Try to wrap raw text as a single cue if it's completely broken but has content

                text = 'WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n' + text;

              }

            }



            const blob = new Blob([text], { type: 'text/vtt' });

            const blobUrl = URL.createObjectURL(blob);

            if (mounted) setSubtitleBlobs(prev => ({ ...prev, [sub.url]: blobUrl }));

          } else {

            console.warn('Failed to fetch subtitle via proxy:', sub.lang, res.status);

          }

        } catch (e) {

          console.warn('Error prefetching subtitle', sub.lang, e);

        }

      }

    })();



    return () => {

      mounted = false;

    };

  }, [subtitleKey, headersKey]);



  // Apply subtitle setting when subtitle blobs are loaded

  useEffect(() => {

    const blobsLoaded = Object.keys(subtitleBlobs).length;

    if (blobsLoaded === 0) return;



    // Re-apply current subtitle setting after a short delay for tracks to register

    const timeout = setTimeout(() => {

      handleSubtitleChange(currentSubtitle);

    }, 500);



    return () => clearTimeout(timeout);

  }, [subtitleBlobs]);



  // Fetch skip times after manifest parsed when duration is known

  useEffect(() => {

    if (!malId || !episodeNumber) return;



    const onManifestParsed = () => {

      const length = videoRef.current?.duration;

      fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

    };



    // If duration already available, call immediately

    if (videoRef.current?.duration && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {

      onManifestParsed();

    }



    // Also call when manifest parsed via HLS

    const handler = () => onManifestParsed();

    const hls = hlsRef.current;

    if (hls) hls.on(Hls.Events.MANIFEST_PARSED, handler);



    return () => {

      if (hls) hls.off(Hls.Events.MANIFEST_PARSED, handler);

    };

  }, [malId, episodeNumber, fetchSkipTimes]);



  // Ensure subtitles are applied when tracks become available

  useEffect(() => {

    const video = videoRef.current;

    if (!video) return;



    const applyOnceTracksAvailable = () => {

      const tracks = video.textTracks;

      if (tracks && tracks.length > 0) {

        handleSubtitleChange(currentSubtitle);

      }

    };



    // Try immediately

    applyOnceTracksAvailable();



    // Poll briefly until tracks are available

    let attempts = 0;

    const interval = setInterval(() => {

      attempts += 1;

      applyOnceTracksAvailable();

      if (attempts > 10) clearInterval(interval);

    }, 300);



    return () => clearInterval(interval);

  }, [currentSubtitle, subtitles]);



  // Check for active skip time

  useEffect(() => {

    const skip = getActiveSkip(currentTime);

    setActiveSkip(skip);

  }, [currentTime, getActiveSkip]);



  const handleSkip = useCallback(() => {

    if (activeSkip && videoRef.current) {

      videoRef.current.currentTime = activeSkip.interval.endTime;

      setActiveSkip(null);

    }

  }, [activeSkip]);



  // Detect mobile

  useEffect(() => {

    const checkMobile = () => setIsMobile(window.innerWidth < 768);

    checkMobile();

    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);

  }, []);



  const sourceKey = currentSource?.url || '';



  const loadVideo = useCallback(

    () => {

      if (!currentSource?.url || !videoRef.current) return;



      setVideoError(null);

      setIsBuffering(true);



      // Clear any existing progress saver when loading a new source

      if (progressIntervalRef.current !== null) {

        clearInterval(progressIntervalRef.current as number);

        progressIntervalRef.current = null;

      }



      // Check if we have a local download for this episode
      const downloadId = `${animeId}-${episodeNumber}`;
      const download = downloads[downloadId];

      let videoUrl = currentSource.url;

      // Only check download status if NOT in offline mode
      // If isOffline is true, we trust the source passed to us (which is the local file)
      if (!isOffline && download?.status === 'completed' && download.localUri) {
        videoUrl = convertFileSrc(download.localUri);
      } else if (currentSource.url.startsWith('file:') || currentSource.url.match(/^[a-zA-Z]:\\/)) {
        // Verify if it's already a raw path passed from elsewhere
        videoUrl = convertFileSrc(currentSource.url);
      }

      const isM3U8 = !isOffline && (currentSource.isM3U8 || videoUrl.includes(".m3u8") || videoUrl.includes("playlist.m3u8")) && !videoUrl.endsWith('.mp4');
      const referer = headers?.Referer;
      // Fallback to browser UA if not provided by source (crucial for Cloudflare bypass)
      const userAgent = headers?.["User-Agent"] || navigator.userAgent;

      // Use our backend proxy if not local and not already proxied
      // CRITICAL FIX: Do not proxy local assets (asset:// or asset.localhost)
      const isLocal = videoUrl.startsWith('asset://') || videoUrl.includes('asset.localhost') || videoUrl.startsWith('http://asset.localhost');

      // If offline/local, strictly use the provided URL without proxy
      // Also ensure we handle encoded spaces correctly for local files
      const proxiedUrl = (isLocal || isOffline)
        ? videoUrl
        : (videoUrl.startsWith('http') ? getProxiedVideoUrl(videoUrl, referer, userAgent) : videoUrl);

      console.log('Loading video:', { original: videoUrl, final: proxiedUrl, isLocal, isOffline });

      trackEvent('Video', 'Initialize', `${animeName} Ep ${episodeNumber}`, episodeNumber);

      if (isM3U8 && Hls.isSupported()) {
        const hls = new Hls({
          xhrSetup: (xhr, url) => {
            // If it's a local asset, no headers needed, or specific handling
            if (url.startsWith('asset://') || url.startsWith('http://asset.localhost')) {
              return;
            }

            xhr.timeout = 30000;

            if (url.includes('rapid-service') || url.includes('supabase.co')) {

              try {

                const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

                if (key) {

                  xhr.setRequestHeader('apikey', key);

                  xhr.setRequestHeader('Authorization', `Bearer ${key}`);

                }

              } catch (e) {

                // Some browsers may disallow setting certain headers; fail silently

              }

            }

          },

          enableWorker: true,

          lowLatencyMode: false,

          backBufferLength: 90,

        });



        // Start periodic progress saver when HLS is attached

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }





        hls.loadSource(proxiedUrl);

        hls.attachMedia(videoRef.current);



        hls.on(Hls.Events.MANIFEST_PARSED, () => {

          console.log('HLS manifest parsed successfully');

          setIsBuffering(false);

          videoRef.current?.play().catch(() => { });



          // Once manifest parsed, fetch skip times using known duration

          const length = videoRef.current?.duration;

          if (malId && episodeNumber) {

            fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

          }



          // Ensure subtitle selection is applied after tracks are available

          if (currentSubtitle && currentSubtitle !== 'off') {

            handleSubtitleChange(currentSubtitle);

          }

          // Rewrite relative URLs to proxied upstream URLs to preserve CORS

          // Apply initial seek for native HLS / loadedmetadata

          if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

            try {

              const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

              if (videoRef.current) videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } catch (e) {

              console.warn('Failed initial seek:', e);

            }

          }

        });



        hls.on(Hls.Events.ERROR, async (_, data) => {

          console.error('HLS error:', data.type, data.details);

          if (data.response?.code === 0 || data.details === 'manifestLoadError') {
            toast.error("Playback blocked? Try disabling 'Tracking Prevention' or switching servers.", { duration: 5000, id: 'tracking-prevention' });
          }



          // Try client-side manifest fetch fallback for manifestLoadError

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details && String(data.details).toLowerCase().includes('manifest') && !manifestFallbackRef.current) {

            manifestFallbackRef.current = true;

            try {

              console.log('Attempting client-side manifest fetch fallback for', proxiedUrl);

              const apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;

              const headers: Record<string, string> = {

                'apikey': apikey || '',

              };

              if (apikey) {

                headers['Authorization'] = `Bearer ${apikey}`;

              }

              const res = await fetch(proxiedUrl, { headers, redirect: 'follow' });

              const text = await res.text().catch(() => '');



              // Check if we got a valid manifest

              if (!text || !text.trim().startsWith('#EXTM3U')) {

                console.warn('Manifest fallback returned invalid content');

                setVideoError('Manifest blocked or invalid - try another server');

                if (onError) onError();

                return;

              }

            } catch (e) {

              console.warn('Client-side manifest fetch fallback failed:', e);

            }

          }



          if (data.fatal) {

            // Surface manifest parsing problems explicitly so we can switch servers

            if (data.details && String(data.details).toLowerCase().includes('manifest')) {

              setVideoError('Manifest blocked or invalid - switching server');

              if (onError) onError();

              hls.stopLoad();

              return;

            }



            switch (data.type) {

              case Hls.ErrorTypes.NETWORK_ERROR:

                console.error('Network error - attempting recovery');

                if (retryCount < 2) {

                  setRetryCount(prev => prev + 1);

                  hls.startLoad();

                } else {

                  setVideoError("Network error - try another server");

                  if (onError) onError();

                }

                break;

              case Hls.ErrorTypes.MEDIA_ERROR:

                console.error('Media error - attempting recovery');

                hls.recoverMediaError();

                break;

              default:

                setVideoError("Failed to load video");

                if (onError) onError();

                break;

            }

          }

        });



        hlsRef.current = hls;

      } else if (

        videoRef.current.canPlayType("application/vnd.apple.mpegurl")

      ) {

        // Safari native HLS support

        videoRef.current.src = proxiedUrl;

        videoRef.current.addEventListener("loadedmetadata", () => {

          setIsBuffering(false);

          // Fetch skip times now that duration is available

          const length = videoRef.current?.duration;

          if (malId && episodeNumber) {

            fetchSkipTimes(malId, episodeNumber, isFinite(length) && length > 0 ? Math.floor(length) : undefined);

          }

          // Ensure subtitle selection is applied

          if (currentSubtitle && currentSubtitle !== 'off') {

            handleSubtitleChange(currentSubtitle);

          }



          // Apply initial seek for native HLS / loadedmetadata

          if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

            try {

              const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

              if (videoRef.current) videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } catch (e) {

              console.warn('Failed initial seek:', e);

            }

          }



          videoRef.current?.play().catch(() => { });

        });



        // Ensure periodic saver for native HLS/native playback

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }

      } else {

        // Direct playback for non-HLS

        videoRef.current.src = proxiedUrl;

        setIsBuffering(false);



        // Apply initial seek for direct playback if needed

        if (initialSeekRef.current !== undefined && !initialSeekDoneRef.current) {

          try {

            const seekTo = Math.max(0, Math.min(initialSeekRef.current, Math.floor(videoRef.current?.duration || initialSeekRef.current)));

            if (videoRef.current && videoRef.current.readyState >= 1) {

              videoRef.current.currentTime = seekTo;

              initialSeekDoneRef.current = true;

            } else {

              // Wait for loadedmetadata to set the time

              const once = () => {

                try {

                  videoRef.current!.currentTime = seekTo;

                } catch (e) {

                  console.warn('Failed initial seek on metadata:', e);

                }

                initialSeekDoneRef.current = true;

                videoRef.current?.removeEventListener('loadedmetadata', once);

              };

              videoRef.current.addEventListener('loadedmetadata', once);

            }

          } catch (e) {

            console.warn('Failed initial seek:', e);

          }

        }



        // Also start periodic saver

        if (progressIntervalRef.current === null) {

          progressIntervalRef.current = window.setInterval(() => {

            const time = Math.floor(videoRef.current?.currentTime || 0);

            const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

            if (onProgressUpdate && time !== lastSavedProgressRef.current && Math.abs(time - lastSavedProgressRef.current) >= PROGRESS_SAVE_INTERVAL) {

              onProgressUpdate(time, dur, false);

              setLastSavedProgress(time);

              lastSavedProgressRef.current = time;

            }

          }, PROGRESS_SAVE_INTERVAL * 1000);

        }

      }

    },

    [sourceKey, headersKey, retryCount, animeName, episodeNumber, malId, isOffline]

  );



  useEffect(() => {

    loadVideo();



    return () => {

      if (hlsRef.current) {

        hlsRef.current.destroy();

        hlsRef.current = null;

      }

    };

  }, [loadVideo]);



  // Video event handlers

  useEffect(() => {

    const video = videoRef.current;

    if (!video) return;



    const handleTimeUpdate = () => setCurrentTime(video.currentTime);

    const handleDurationChange = () => setDuration(video.duration);

    const handlePlay = () => { setIsPlaying(true); onPlay?.(); };

    const handlePause = () => { setIsPlaying(false); onPause?.(); };

    const handleWaiting = () => setIsBuffering(true);

    const handlePlaying = () => setIsBuffering(false);

    const handleProgress = () => {

      if (video.buffered.length > 0) {

        setBuffered(video.buffered.end(video.buffered.length - 1));

      }

    };

    const handleEnded = () => {
      // Final save marking completed
      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;
      const finalPos = Math.floor(videoRef.current?.currentTime || 0);
      if (onProgressUpdate) {
        onProgressUpdate(dur ?? finalPos, dur, true);
      }

      if (settings.autoNextEpisode && onEpisodeEnd) {
        onEpisodeEnd();
      }
    };

    const handleError = (e: any) => {
      console.error('Video Error:', e);
      const err = videoRef.current?.error;
      if (err) {
        console.error('Video Error Code:', err.code, err.message);
        setVideoError(`Playback Error (${err.code}): ${err.message || 'Unknown error'}`);
      } else {
        setVideoError('Playback failed');
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };

  }, [settings.autoNextEpisode, onEpisodeEnd]);



  // Keep latest progress callback without re-subscribing effects

  useEffect(() => {

    progressCallbackRef.current = onProgressUpdate ?? null;

  }, [onProgressUpdate]);



  // Persist final progress on unload or when component unmounts

  useEffect(() => {

    const handleBeforeUnload = () => {

      const time = Math.floor(videoRef.current?.currentTime || 0);

      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false);

    };



    window.addEventListener('beforeunload', handleBeforeUnload);



    return () => {

      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (progressIntervalRef.current !== null) {

        clearInterval(progressIntervalRef.current as number);

        progressIntervalRef.current = null;

      }

      // Save one last time on unmount using the latest callback

      const time = Math.floor(videoRef.current?.currentTime || 0);

      const dur = Math.floor(videoRef.current?.duration || 0) || undefined;

      if (progressCallbackRef.current) progressCallbackRef.current(time, dur, false);

    };

  }, []);



  // Keyboard shortcuts (desktop only)

  useEffect(() => {

    if (isMobile) return;



    const handleKeyDown = (e: KeyboardEvent) => {

      if (

        document.activeElement?.tagName === "INPUT" ||

        document.activeElement?.tagName === "TEXTAREA"

      )

        return;



      switch (e.key.toLowerCase()) {

        case " ":

        case "k":

          e.preventDefault();

          togglePlay();

          break;

        case "f":

          e.preventDefault();

          toggleFullscreen();

          break;

        case "m":

          e.preventDefault();

          toggleMute();

          break;

        case "arrowleft":

          e.preventDefault();

          skip(-10);

          break;

        case "arrowright":

          e.preventDefault();

          skip(10);

          break;

        case "arrowup":

          e.preventDefault();

          changeVolume(0.1);

          break;

        case "arrowdown":

          e.preventDefault();

          changeVolume(-0.1);

          break;

      }

    };



    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);

  }, [isMobile]);



  // Controls visibility

  const showControlsTemporarily = useCallback(() => {

    setShowControls(true);

    if (controlsTimeoutRef.current) {

      clearTimeout(controlsTimeoutRef.current);

    }

    controlsTimeoutRef.current = setTimeout(() => {

      if (isPlaying) setShowControls(false);

    }, 3000);

  }, [isPlaying]);



  const togglePlay = () => {

    if (videoRef.current) {

      if (isPlaying) {

        videoRef.current.pause();

      } else {

        videoRef.current.play().catch(() => { });

      }

    }

  };



  const toggleMute = () => {

    if (videoRef.current) {

      videoRef.current.muted = !isMuted;

      setIsMuted(!isMuted);

    }

  };



  const changeVolume = (delta: number) => {

    if (videoRef.current) {

      const newVolume = Math.max(0, Math.min(1, volume + delta));

      videoRef.current.volume = newVolume;

      setVolume(newVolume);

      if (newVolume > 0) setIsMuted(false);

    }

  };



  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const newVolume = parseFloat(e.target.value);

    if (videoRef.current) {

      videoRef.current.volume = newVolume;

      setVolume(newVolume);

      setIsMuted(newVolume === 0);

    }

  };



  const skip = (seconds: number) => {

    if (videoRef.current) {

      videoRef.current.currentTime = Math.max(

        0,

        Math.min(duration, currentTime + seconds)

      );

    }

  };



  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {

    const rect = e.currentTarget.getBoundingClientRect();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

    const percent = (clientX - rect.left) / rect.width;

    if (videoRef.current) {

      videoRef.current.currentTime = Math.max(0, Math.min(duration, percent * duration));

    }

  };



  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if ((document as any).pictureInPictureEnabled !== false) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported', e);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  const toggleFullscreen = () => {

    if (!containerRef.current) return;



    if (!isFullscreen) {

      if (containerRef.current.requestFullscreen) {

        containerRef.current.requestFullscreen();

      } else if ((containerRef.current as any).webkitRequestFullscreen) {

        (containerRef.current as any).webkitRequestFullscreen();

      }

    } else {

      if (document.exitFullscreen) {

        document.exitFullscreen();

      } else if ((document as any).webkitExitFullscreen) {

        (document as any).webkitExitFullscreen();

      }

    }

  };



  useEffect(() => {

    const handleFullscreenChange = () => {

      setIsFullscreen(!!document.fullscreenElement);

    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {

      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);

    };

  }, []);



  const handlePlaybackRateChange = (rate: number) => {

    if (videoRef.current) {

      videoRef.current.playbackRate = rate;

      setPlaybackRate(rate);

    }

    setShowSettings(false);

  };





  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;



  return (

    <div

      ref={containerRef}

      className="relative aspect-video bg-black rounded-xl md:rounded-2xl overflow-hidden group touch-manipulation video-player-container video-player-modern"

      onMouseMove={!isMobile ? showControlsTemporarily : undefined}

      onMouseLeave={() => !isMobile && isPlaying && setShowControls(false)}

      onTouchStart={showControlsTemporarily}

    >

      {/* Video Element with enhanced subtitle styling */}

      <video
        ref={videoRef}
        className={`w-full h-full object-contain video-with-subtitles subtitle-${settings.subtitleSize} subtitle-font-${settings.subtitleFont} subtitle-bg-${settings.subtitleBackground}`}
        poster={resolvedPoster}
        playsInline
        // REMOVED crossOrigin entirely for offline to avoid local asset blocks
        {...(!isOffline ? { crossOrigin: "anonymous" } : {})}
        onClick={togglePlay}
      >

        {[...subtitles, ...customSubtitles].map((sub, idx) => {
          const blobUrl = subtitleBlobs[sub.url];
          // For custom subs, the url IS the blob url (or local url)
          const src = sub.lang === 'custom' ? sub.url : blobUrl;

          // Only render track if we have a blob URL (prefetched) to avoid CORS issues
          if (!src) return null;

          return (
            <track
              key={`${sub.url}-${idx}`}
              kind="subtitles"
              src={src}
              srcLang={sub.lang}
              label={sub.label || sub.lang}
              default={idx === 0 && currentSubtitle !== 'off'}
            />
          );
        })}

      </video>



      {/* View Counter Overlay - shows in top right */}

      {viewCount !== undefined && viewCount > 0 && showControls && (

        <div className="absolute top-3 right-3 md:top-4 md:right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 backdrop-blur-md text-white/90 text-xs md:text-sm font-medium z-10 transition-all duration-300 border border-white/10">

          <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />

          <span className="font-semibold">{viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : viewCount}</span>

          <span className="text-white/50 hidden sm:inline">views</span>

        </div>

      )}



      {/* Loading State */}

      {(isLoading || isBuffering) && !videoError && (

        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">

          <div className="flex flex-col items-center gap-4">

            <div className="relative">

              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />

              <div className="absolute inset-0 flex items-center justify-center">

                <Play className="w-6 h-6 md:w-8 md:h-8 text-primary/70" />

              </div>

            </div>

            <span className="text-sm md:text-base text-white/80 font-medium">

              {serverName ? `Loading ${serverName}...` : "Loading..."}

            </span>

          </div>

        </div>

      )}



      {/* Error State with detailed info */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-50">
          <div className="flex flex-col items-center gap-4 text-center p-6 md:p-10 max-w-md">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 md:w-10 md:h-10 text-destructive" />
            </div>
            <p className="text-base md:text-lg text-white font-semibold">{videoError}</p>
            {isOffline && (
              <div className="text-xs text-white/50 bg-black/50 p-2 rounded mt-2 font-mono break-all max-w-[300px]">
                Debug: {videoRef.current?.currentSrc || 'No Source'} <br />
                Error: {videoRef.current?.error?.message || videoRef.current?.error?.code || 'Unknown'}
              </div>
            )}

            <p className="text-sm text-white/60">Try switching to a different server</p>

            <div className="flex flex-col sm:flex-row gap-3 mt-2">

              <button

                onClick={() => {

                  setRetryCount(0);

                  loadVideo();

                }}

                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center gap-2 transition-all font-medium video-controls-btn"

              >

                <RefreshCw className="w-4 h-4" />

                Retry

              </button>

              {onServerSwitch && (

                <button

                  onClick={onServerSwitch}

                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground flex items-center justify-center gap-2 transition-all font-medium shadow-lg shadow-primary/30"

                >

                  Switch Server

                </button>

              )}

            </div>

          </div>

        </div>

      )}



      {/* Center Play Button */}

      {!isPlaying && !isLoading && !isBuffering && !videoError && !isLive && (

        <button

          onClick={togglePlay}

          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/50 via-transparent to-black/20"

        >

          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/90 flex items-center justify-center hover:scale-110 transition-all duration-300 shadow-2xl shadow-primary/40 backdrop-blur-sm border border-white/20">

            <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-current ml-1" />

          </div>

        </button>

      )}



      {/* Aniskip Skip Button */}

      {activeSkip && !videoError && (

        <button

          onClick={handleSkip}

          className="absolute bottom-24 md:bottom-28 right-4 md:right-6 px-5 py-3 md:px-6 md:py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-bold flex items-center gap-2.5 shadow-2xl transition-all hover:scale-105 animate-in slide-in-from-right-5 z-20 skip-button-glow border border-white/20"

        >

          <FastForward className="w-5 h-5 md:w-6 md:h-6" />

          <span className="text-sm md:text-base uppercase tracking-wide">{getSkipLabel(activeSkip.skipType)}</span>

        </button>

      )}



      {/* Controls Overlay */}

      <div

        className={`absolute inset-x-0 bottom-0 video-controls-gradient p-4 md:p-5 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"

          }`}

      >

        {/* Progress Bar */}

        <div

          className={`relative h-1 md:h-1.5 bg-white/20 rounded-full group/progress mb-4 md:mb-5 video-progress-track ${isLive ? 'cursor-default pointer-events-none' : 'cursor-pointer'}`}

          onClick={!isLive ? handleSeek : undefined}

          onTouchMove={!isLive ? handleSeek : undefined}

        >

          {/* Skip Time Markers (yellow) */}

          {skipTimes.map((skip) => {

            const startPercent = duration > 0 ? (skip.interval.startTime / duration) * 100 : 0;

            const widthPercent = duration > 0 ? ((skip.interval.endTime - skip.interval.startTime) / duration) * 100 : 0;

            return (

              <div

                key={skip.skipId}

                className="absolute h-full bg-yellow-400 rounded-full z-10"

                style={{

                  left: `${startPercent}%`,

                  width: `${widthPercent}%`

                }}

                title={getSkipLabel(skip.skipType)}

              />

            );

          })}

          {/* Buffered */}

          <div

            className="absolute h-full bg-white/30 rounded-full"

            style={{ width: `${bufferedPercent}%` }}

          />

          {/* Progress */}

          <div

            className="absolute h-full bg-gradient-to-r from-primary via-primary to-secondary rounded-full z-20 transition-all"

            style={{ width: `${progress}%` }}

          />

          {/* Thumb */}

          {!isLive && (

            <div

              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-all z-30 ring-2 ring-primary/50"

              style={{ left: `calc(${progress}% - 8px)` }}

            />

          )}

        </div>



        {/* Controls Row */}

        <div className="flex items-center justify-between gap-3 md:gap-4">

          {/* Left Controls */}

          <div className="flex items-center gap-1.5 md:gap-2">

            <button

              onClick={togglePlay}

              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"

            >

              {isPlaying ? (

                <Pause className="w-5 h-5 md:w-6 md:h-6" />

              ) : (

                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />

              )}

            </button>



            {!isLive && (

              <>

                <button

                  onClick={() => skip(-10)}

                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn"

                >

                  <SkipBack className="w-4 h-4 md:w-5 md:h-5" />

                </button>



                <button

                  onClick={() => skip(10)}

                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hidden sm:flex video-controls-btn"

                >

                  <SkipForward className="w-4 h-4 md:w-5 md:h-5" />

                </button>

              </>

            )}



            {/* Volume - hide on mobile */}

            <div className="hidden md:flex items-center gap-2 group/volume ml-1">

              <button

                onClick={toggleMute}

                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all video-controls-btn"

              >

                {isMuted || volume === 0 ? (

                  <VolumeX className="w-5 h-5" />

                ) : (

                  <Volume2 className="w-5 h-5" />

                )}

              </button>

              <div className="w-0 group-hover/volume:w-24 overflow-hidden transition-all duration-300">

                <input

                  type="range"

                  min="0"

                  max="1"

                  step="0.05"

                  value={isMuted ? 0 : volume}

                  onChange={handleVolumeChange}

                  className="w-24 h-1.5 accent-primary cursor-pointer bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"

                />

              </div>

            </div>



            {/* Time */}

            <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm">

              <span className="text-xs md:text-sm font-medium text-white/90">{formatTime(currentTime)}</span>

              <span className="text-white/40">/</span>

              <span className="text-xs md:text-sm text-white/60">{formatTime(duration)}</span>

            </div>

          </div>



          {/* Right Controls */}

          <div className="flex items-center gap-1 md:gap-2">

            {/* Subtitle Selector */}

            {subtitles.length > 0 && (

              <div className="relative">

                <button

                  onClick={() => {

                    setShowSubtitleMenu(!showSubtitleMenu);

                    setShowSettings(false);

                  }}

                  className={`p-2 rounded-lg hover:bg-white/10 transition-colors pointer-events-auto ${currentSubtitle !== 'off' ? 'text-primary' : ''

                    }`}

                >

                  <Subtitles className="w-4 h-4 md:w-5 md:h-5" />

                </button>



                {showSubtitleMenu && (

                  <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[120px] md:min-w-[150px] max-h-[400px] overflow-y-auto pointer-events-auto">

                    <div className="text-xs text-muted-foreground px-2 py-1 mb-1">

                      Subtitles

                    </div>

                    <button

                      onClick={() => {

                        handleSubtitleChange('off');

                        setShowSubtitleMenu(false);

                      }}

                      className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === 'off'

                        ? "text-primary font-medium"

                        : "text-foreground"

                        }`}

                    >

                      Off

                    </button>

                    {/* Native Subtitles */}
                    {[...subtitles, ...customSubtitles].map((sub, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleSubtitleChange(sub.lang === 'custom' ? 'custom' : sub.lang); // Simple toggle for now, ideally unique IDs
                          setShowSubtitleMenu(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${currentSubtitle === (sub.lang === 'custom' ? 'custom' : sub.lang)
                          ? "text-primary font-medium"
                          : "text-foreground"
                          }`}
                      >
                        <span className="truncate block max-w-[120px]">{sub.label || sub.lang}</span>
                      </button>
                    ))}

                    <div className="h-px bg-border my-1" />

                    <label className="w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors text-foreground flex items-center gap-2 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>Add Custom</span>
                      <input
                        type="file"
                        accept=".vtt,.srt"
                        className="hidden"
                        onChange={handleCustomSubtitleUpload}
                      />
                    </label>

                  </div>

                )}

              </div>

            )}



            {/* Speed Settings */}

            <div className="relative">

              <button

                onClick={() => {

                  setShowSettings(!showSettings);

                  setShowSubtitleMenu(false);

                }}

                className="p-2 rounded-lg hover:bg-white/10 transition-colors"

              >

                <Settings className="w-4 h-4 md:w-5 md:h-5" />

              </button>



              {showSettings && (

                <div className="absolute bottom-full right-0 mb-2 bg-background/95 backdrop-blur-sm border border-border rounded-xl p-2 min-w-[100px] md:min-w-[120px]">

                  <div className="text-xs text-muted-foreground px-2 py-1 mb-1">

                    Speed

                  </div>

                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (

                    <button

                      key={rate}

                      onClick={() => handlePlaybackRateChange(rate)}

                      className={`w-full px-3 py-1.5 text-left text-xs md:text-sm rounded-lg hover:bg-muted transition-colors ${playbackRate === rate

                        ? "text-primary font-medium"

                        : "text-foreground"

                        }`}

                    >

                      {rate}x

                    </button>

                  ))}

                </div>

              )}

            </div>



            {/* Player Preferences */}

            <button

              onClick={() => setShowSettingsPanel(true)}

              className="p-2 rounded-lg hover:bg-white/10 transition-colors"

              title="Player Preferences"

            >

              <SlidersHorizontal className="w-4 h-4 md:w-5 md:h-5" />

            </button>



            {/* Download Button (Native only, not in offline mode) */}
            {isNative && !isOffline && serverName?.includes('Luffy') && episodeId && (
              <div className="relative group/download">
                <button
                  onClick={async () => {
                    await startDownload({
                      episodeId: episodeId,
                      animeName: animeName || '',
                      episodeNumber: episodeNumber || 1,
                      posterUrl: animePoster || poster || '',
                    });
                  }}
                  disabled={downloadStates[episodeId]?.status === 'downloading'}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors relative"
                  title="Download Episode"
                >
                  {downloadStates[episodeId]?.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                  ) : downloadStates[episodeId]?.status === 'downloading' ? (
                    <div className="relative flex items-center justify-center">
                      <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-primary" />
                      <span className="absolute text-[6px] font-bold">
                        {Math.round(downloadStates[episodeId]?.progress || 0)}
                      </span>
                    </div>
                  ) : (
                    <Download className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              </div>
            )}



            {/* Picture in Picture */}
            {!isMobile && typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (document as any).pictureInPictureEnabled && (
              <button
                onClick={togglePiP}
                className={`p-2 rounded-lg hover:bg-white/10 transition-colors ${isPiP ? 'text-primary' : ''}`}
                title="Picture in Picture (I)"
              >
                <PictureInPicture2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}

            {/* Fullscreen */}

            <button

              onClick={toggleFullscreen}

              className="p-2 rounded-lg hover:bg-white/10 transition-colors"

            >

              {isFullscreen ? (

                <Minimize className="w-4 h-4 md:w-5 md:h-5" />

              ) : (

                <Maximize className="w-4 h-4 md:w-5 md:h-5" />

              )}

            </button>

          </div>

        </div>

      </div>



      {/* Settings Panel */}

      <VideoSettingsPanel

        isOpen={showSettingsPanel}

        onClose={() => setShowSettingsPanel(false)}

        availableSubtitles={subtitles.map(s => ({ lang: s.lang, label: s.label || s.lang, value: s.lang }))}

      />

    </div >

  );

}