'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Subtitles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type Hls from 'hls.js';

interface VideoSource {
  url: string;
  quality?: string;
  isM3U8: boolean;
  type?: string;
}

interface VideoSubtitle {
  url: string;
  lang: string;
  label?: string;
}

interface VideoPlayerProps {
  sources: VideoSource[];
  subtitles?: VideoSubtitle[];
}

export default function VideoPlayer({ sources, subtitles }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsTimeout, setControlsTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('off');
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoInitialized, setIsVideoInitialized] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);

  // Debug subtitles
  console.log('VideoPlayer subtitles:', subtitles);

  // Get the best quality source
  const getBestSource = () => {
    if (!sources || sources.length === 0) return null;
    
    // Prefer m3u8 sources
    const m3u8Sources = sources.filter(s => s.isM3U8);
    if (m3u8Sources.length > 0) {
      return m3u8Sources[0];
    }
    
    // Otherwise use the first available source
    return sources[0];
  };

  const currentSource = getBestSource();

  // Get proxied URL for external video sources
  const getProxiedUrl = (url: string) => {
    // If it's already a proxy URL, return as is
    if (url.startsWith('/api/video-proxy')) {
      return url;
    }
    
    // If it's an external URL, proxy it
    if (url.startsWith('http')) {
      return `/api/video-proxy?url=${encodeURIComponent(url)}`;
    }
    
    return url;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSource) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      setError('Failed to load video');
      setIsLoading(false);
    };

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setIsVideoInitialized(true);
      
      // If there's a pending play request, execute it
      if (pendingPlay) {
        togglePlay();
      }
    };

    const handleLoadedData = () => {
      setIsVideoInitialized(true);
      if (pendingPlay) {
        togglePlay();
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('error', handleError);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleLoadedData);

        // Load HLS.js for M3U8 streams
    const loadVideo = async () => {
      if (isVideoInitialized) {
        setIsVideoInitialized(false);
      }
      
      try {
        console.log('Loading video source:', currentSource);
        const proxiedUrl = getProxiedUrl(currentSource.url);
        console.log('Using proxied URL:', proxiedUrl);
        
        setError(null);
        setIsLoading(true);
        setPendingPlay(false);
        
        if (currentSource.isM3U8) {
          console.log('Loading M3U8 stream with HLS.js');
          // Use HLS.js for M3U8 streams
          const Hls = (await import('hls.js')).default;
          
          if (Hls.isSupported()) {
            console.log('HLS.js is supported');
            // Clean up previous HLS instance
            if (hlsRef.current) {
              hlsRef.current.destroy();
              hlsRef.current = null;
            }
            
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              debug: false,
            });
            
            hlsRef.current = hls;
            
            console.log('Loading HLS source:', proxiedUrl);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              console.log('HLS manifest parsed successfully');
              setIsLoading(false);
            });
            
            hls.loadSource(proxiedUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.ERROR, (event: unknown, data: { type: string; details: string; fatal: boolean }) => {
              console.error('HLS error event:', event);
              console.error('HLS error data:', data);
              console.error('HLS error type:', data.type);
              console.error('HLS error details:', data.details);
              console.error('HLS error fatal:', data.fatal);
              
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.error('Fatal network error encountered, trying direct video element fallback...');
                    // Try direct video element as fallback
                    video.src = proxiedUrl;
                    setError(`Network error: ${data.details}`);
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.error('Fatal media error encountered, trying to recover...');
                    setError(`Media error: ${data.details}`);
                    break;
                  default:
                    console.error('Fatal error, cannot recover');
                    setError(`HLS error: ${data.details || 'Unknown error'}`);
                    break;
                }
                setIsLoading(false);
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            console.log('Using native HLS support');
            const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(currentSource.url)}`;
            video.src = proxyUrl;
          } else {
            console.error('HLS not supported in this browser');
            setError('HLS not supported in this browser');
            setIsLoading(false);
          }
        } else {
          // Regular video source
          console.log('Loading regular video source');
          const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(currentSource.url)}`;
          video.src = proxyUrl;
        }
      } catch (err) {
        console.error('Error loading video:', err);
        setError('Failed to load video');
        setIsLoading(false);
      }
    };

    loadVideo();

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleLoadedData);
      
      // Clean up HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      // Clean up timeout
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  }, [currentSource]);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || isLoading) return;

    try {
      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
      } else {
        // Wait for video to be ready before playing
        if (video.readyState < 3) {
          setPendingPlay(true);
          return;
        }
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          await playPromise;
          setIsPlaying(true);
          setPendingPlay(false);
        }
      }
    } catch (error) {
      console.error('Error toggling play:', error);
      setIsPlaying(false);
      setPendingPlay(false);
    }
  }, [isLoading, isPlaying]);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);
    
    setControlsTimeout(timeout);
  };

  const handleMouseMove = () => {
    showControlsTemporarily();
  };

  const handleVideoClick = () => {
    togglePlay();
    showControlsTemporarily();
  };

  // Initialize subtitles when available
  useEffect(() => {
    if (subtitles && subtitles.length > 0 && currentSubtitle === 'off') {
      console.log('Initializing subtitles:', subtitles);
      // Set first subtitle as default
      setCurrentSubtitle(subtitles[0].lang);
      
      // Enable first subtitle track
      const video = videoRef.current;
      if (video) {
        setTimeout(() => {
          const tracks = video.textTracks;
          console.log('Text tracks found:', tracks.length);
          if (tracks.length > 0) {
            tracks[0].mode = 'showing';
            console.log('Enabled first subtitle track:', tracks[0]);
            for (let i = 1; i < tracks.length; i++) {
              tracks[i].mode = 'hidden';
            }
          }
        }, 500); // Increased delay to ensure tracks are loaded
      }
    }
  }, [subtitles, currentSubtitle]);

  const handleSubtitleChange = (lang: string) => {
    console.log('Changing subtitle to:', lang);
    const video = videoRef.current;
    if (!video) return;

    const tracks = video.textTracks;
    console.log('Available tracks:', tracks.length);
    
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      console.log(`Track ${i}:`, track.language, track.label);
      
      if (lang === 'off') {
        track.mode = 'disabled';
      } else if (track.language === lang || track.label === lang) {
        track.mode = 'showing';
        console.log('Enabled track:', track);
      } else {
        track.mode = 'hidden';
      }
    }
    setCurrentSubtitle(lang);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  if (!currentSource) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-xl">No video source available</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-full bg-black group cursor-pointer"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      onClick={handleVideoClick}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
        controls={false}
        crossOrigin="anonymous"
        onClick={(e) => e.stopPropagation()}
      >
        {subtitles?.map((subtitle, index) => (
          <track
            key={index}
            kind="subtitles"
            src={getProxiedUrl(subtitle.url)}
            srcLang={subtitle.lang}
            label={subtitle.label || subtitle.lang}
            default={index === 0}
          />
        ))}
        Your browser does not support the video tag.
      </video>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto mb-4"></div>
            <p className="text-lg">Loading video...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
          <div className="text-center">
            <p className="text-lg text-red-400 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Play/Pause button in center */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <Button
              size="lg"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="text-white hover:text-rose-500 bg-black/30 hover:bg-black/50 rounded-full p-6 backdrop-blur-sm"
            >
              <Play className="w-16 h-16" />
            </Button>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 pointer-events-auto">
          {/* Progress bar */}
          <div 
            className="w-full h-2 bg-white/20 rounded-full mb-6 cursor-pointer group/progress hover:h-3 transition-all"
            onClick={(e) => {
              e.stopPropagation();
              handleSeek(e);
            }}
          >
            <div 
              className="h-full bg-rose-500 rounded-full transition-all relative"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-rose-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"></div>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-6">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="text-white hover:text-rose-500 hover:bg-white/10 rounded-full p-2"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </Button>

              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  className="text-white hover:text-rose-500 hover:bg-white/10 rounded-full p-2"
                >
                  {isMuted ? (
                    <VolumeX className="w-6 h-6" />
                  ) : (
                    <Volume2 className="w-6 h-6" />
                  )}
                </Button>

                {/* Volume slider */}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleVolumeChange(parseFloat(e.target.value));
                  }}
                  className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: `linear-gradient(to right, #f43f5e 0%, #f43f5e ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
              </div>

              <span className="text-sm font-medium">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Subtitle selector - Always show */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={`text-white hover:text-rose-500 hover:bg-white/10 rounded-full p-2 ${
                      currentSubtitle !== 'off' && subtitles && subtitles.length > 0 ? 'text-rose-500' : ''
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Subtitles className="w-6 h-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black/90 backdrop-blur-sm border-white/20">
                  <DropdownMenuItem
                    onClick={() => handleSubtitleChange('off')}
                    className={`text-white hover:bg-white/10 ${
                      currentSubtitle === 'off' ? 'text-rose-500' : ''
                    }`}
                  >
                    Off
                  </DropdownMenuItem>
                  {subtitles && subtitles.length > 0 ? (
                    <>
                      <DropdownMenuSeparator className="bg-white/20" />
                      {subtitles.map((subtitle) => (
                        <DropdownMenuItem
                          key={subtitle.lang}
                          onClick={() => handleSubtitleChange(subtitle.lang)}
                          className={`text-white hover:bg-white/10 ${
                            currentSubtitle === subtitle.lang ? 'text-rose-500' : ''
                          }`}
                        >
                          {subtitle.label || subtitle.lang}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : (
                    <>
                      <DropdownMenuSeparator className="bg-white/20" />
                      <DropdownMenuItem className="text-gray-400 cursor-default">
                        No subtitles available
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Settings menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:text-rose-500 hover:bg-white/10 rounded-full p-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Settings className="w-6 h-6" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-black/90 backdrop-blur-sm border-white/20">
                  {/* Subtitle Settings */}
                  {subtitles && subtitles.length > 0 && (
                    <>
                      <DropdownMenuItem className="text-white hover:bg-white/10 cursor-default">
                        Subtitles
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/20" />
                      <DropdownMenuItem
                        onClick={() => handleSubtitleChange('off')}
                        className={`text-white hover:bg-white/10 ${
                          currentSubtitle === 'off' ? 'text-rose-500' : ''
                        }`}
                      >
                        Off
                      </DropdownMenuItem>
                      {subtitles.map((subtitle) => (
                        <DropdownMenuItem
                          key={subtitle.lang}
                          onClick={() => handleSubtitleChange(subtitle.lang)}
                          className={`text-white hover:bg-white/10 ${
                            currentSubtitle === subtitle.lang ? 'text-rose-500' : ''
                          }`}
                        >
                          {subtitle.label || subtitle.lang}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator className="bg-white/20" />
                    </>
                  )}
                  
                  {/* Playback Speed Settings */}
                  <DropdownMenuItem className="text-white hover:bg-white/10 cursor-default">
                    Playback Speed
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/20" />
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                    <DropdownMenuItem
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={`text-white hover:bg-white/10 ${
                        playbackRate === rate ? 'text-rose-500' : ''
                      }`}
                    >
                      {rate}x
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="text-white hover:text-rose-500 hover:bg-white/10 rounded-full p-2"
              >
                <Maximize className="w-6 h-6" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
