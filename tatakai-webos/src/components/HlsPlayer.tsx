import React, { useRef, useEffect, useState, useCallback } from 'react';
import Focusable from './Focusable';

interface VideoSource {
  url: string;
  quality: string;
  isM3U8?: boolean;
}

interface HlsPlayerProps {
  sources: VideoSource[];
  subtitles?: Array<{ url: string; label: string; language: string }>;
  onClose?: () => void;
  autoPlay?: boolean;
}

export default function HlsPlayer({ sources, subtitles: _subtitles, onClose, autoPlay = false }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [currentSource, setCurrentSource] = useState(sources[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSource || !videoRef.current) return;

    const video = videoRef.current;
    setIsLoading(true);
    setError(null);

    const loadVideo = async () => {
      try {
        if (currentSource.isM3U8) {
          // Dynamic import for HLS.js
          const HLS = await import('hls.js');
          const Hls = HLS.default;

          if (Hls.isSupported()) {
            if (hlsRef.current) {
              hlsRef.current.destroy();
            }

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              debug: false,
            });

            hlsRef.current = hls;
            hls.loadSource(currentSource.url);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false);
              if (autoPlay) {
                video.play();
              }
            });

            hls.on(Hls.Events.ERROR, (event: any, data: any) => {
              console.error('HLS error:', data);
              if (data.fatal) {
                setError(`Playback error: ${data.details}`);
                setIsLoading(false);
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = currentSource.url;
            setIsLoading(false);
          } else {
            setError('HLS not supported in this browser');
            setIsLoading(false);
          }
        } else {
          video.src = currentSource.url;
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error loading video:', err);
        setError('Failed to load video');
        setIsLoading(false);
      }
    };

    loadVideo();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentSource, autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  };

  const changeVolume = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'Escape':
          if (onClose) onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 10));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 10));
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(0, volume - 0.1));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, volume, onClose, togglePlay]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Error</div>
          <div className="text-white mb-4">{error}</div>
          <Focusable
            tag="button"
            className="px-6 py-3 bg-tatakai-purple text-white rounded-lg"
            onEnterPress={onClose}
          >
            Go Back
          </Focusable>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Video */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onClick={() => setShowControls(!showControls)}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-white text-xl">Loading...</div>
          </div>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex flex-col justify-between">
            {/* Top Bar */}
            <div className="flex justify-between items-center p-6">
              <div className="flex items-center space-x-4">
                <Focusable
                  tag="button"
                  className="p-2 rounded-lg bg-black/50 hover:bg-black/70 transition-colors"
                  onEnterPress={onClose}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Focusable>
                <div className="text-white text-lg font-medium">Now Playing</div>
              </div>

              {/* Quality Selector */}
              {sources.length > 1 && (
                <select 
                  value={currentSource.quality}
                  onChange={(e) => {
                    const newSource = sources.find(s => s.quality === e.target.value);
                    if (newSource) setCurrentSource(newSource);
                  }}
                  className="bg-black/50 text-white px-3 py-2 rounded-lg border border-white/20"
                >
                  {sources.map(source => (
                    <option key={source.quality} value={source.quality}>
                      {source.quality}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Bottom Controls */}
            <div className="p-6 space-y-4">
              {/* Progress Bar */}
              <div className="flex items-center space-x-4 text-white">
                <span className="text-sm">{formatTime(currentTime)}</span>
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-tatakai-purple transition-all duration-200"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <span className="text-sm">{formatTime(duration)}</span>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-center space-x-6">
                <Focusable
                  tag="button"
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  onEnterPress={() => seek(Math.max(0, currentTime - 10))}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.333 4z" />
                  </svg>
                </Focusable>

                <Focusable
                  tag="button"
                  className="p-4 rounded-full bg-tatakai-purple hover:bg-purple-700 transition-colors"
                  onEnterPress={togglePlay}
                >
                  {isPlaying ? (
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                </Focusable>

                <Focusable
                  tag="button"
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                  onEnterPress={() => seek(Math.min(duration, currentTime + 10))}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                  </svg>
                </Focusable>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}