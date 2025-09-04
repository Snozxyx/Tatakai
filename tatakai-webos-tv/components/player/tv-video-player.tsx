'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Settings, 
  ArrowLeft,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw
} from 'lucide-react'
import { useTVKeyListener, useBackNavigation } from '../../lib/focus-management'
import { motion, AnimatePresence } from 'framer-motion'

interface Episode {
  id: string
  number: number
  title: string
  url: string
  subtitles?: Array<{
    label: string
    language: string
    url: string
  }>
}

interface VideoPlayerProps {
  episode: Episode
  episodes: Episode[]
  onBack: () => void
  onEpisodeChange: (episode: Episode) => void
}

interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  isFullscreen: boolean
  showControls: boolean
  isBuffering: boolean
}

export function TVVideoPlayer({ episode, episodes, onBack, onEpisodeChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout>()
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    showControls: true,
    isBuffering: false
  })

  const [showSettings, setShowSettings] = useState(false)
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('off')
  const [selectedQuality, setSelectedQuality] = useState<string>('auto')

  // Initialize HLS player
  useEffect(() => {
    if (!videoRef.current) return

    const video = videoRef.current

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      })

      hls.loadSource(episode.url)
      hls.attachMedia(video)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlayerState(prev => ({ ...prev, isBuffering: false }))
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              hls.destroy()
              break
          }
        }
      })

      hlsRef.current = hls

      return () => {
        hls.destroy()
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = episode.url
    }
  }, [episode.url])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setPlayerState(prev => ({
        ...prev,
        currentTime: video.currentTime,
        duration: video.duration || 0
      }))
    }

    const handleLoadStart = () => setPlayerState(prev => ({ ...prev, isBuffering: true }))
    const handleCanPlay = () => setPlayerState(prev => ({ ...prev, isBuffering: false }))
    const handlePlay = () => setPlayerState(prev => ({ ...prev, isPlaying: true }))
    const handlePause = () => setPlayerState(prev => ({ ...prev, isPlaying: false }))
    const handleVolumeChange = () => {
      setPlayerState(prev => ({
        ...prev,
        volume: video.volume,
        isMuted: video.muted
      }))
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadstart', handleLoadStart)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeChange)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadstart', handleLoadStart)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeChange)
    }
  }, [])

  // Player controls
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return
    
    if (playerState.isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
  }, [playerState.isPlaying])

  const seek = useCallback((seconds: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + seconds))
  }, [])

  const setVolume = useCallback((volume: number) => {
    if (!videoRef.current) return
    videoRef.current.volume = Math.max(0, Math.min(1, volume))
  }, [])

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return
    videoRef.current.muted = !videoRef.current.muted
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  // Auto-hide controls
  const showControlsTemporarily = useCallback(() => {
    setPlayerState(prev => ({ ...prev, showControls: true }))
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    
    controlsTimeoutRef.current = setTimeout(() => {
      setPlayerState(prev => ({ ...prev, showControls: false }))
    }, 3000)
  }, [])

  // TV Remote key handling
  useTVKeyListener(['PLAY_PAUSE', 'PLAY', 'PAUSE'], () => {
    togglePlayPause()
    showControlsTemporarily()
  })

  useTVKeyListener(['REWIND'], () => {
    seek(-10)
    showControlsTemporarily()
  })

  useTVKeyListener(['FAST_FORWARD'], () => {
    seek(10)
    showControlsTemporarily()
  })

  useTVKeyListener(['LEFT'], () => {
    seek(-30)
    showControlsTemporarily()
  })

  useTVKeyListener(['RIGHT'], () => {
    seek(30)
    showControlsTemporarily()
  })

  useTVKeyListener(['UP'], () => {
    setVolume(playerState.volume + 0.1)
    showControlsTemporarily()
  })

  useTVKeyListener(['DOWN'], () => {
    setVolume(playerState.volume - 0.1)
    showControlsTemporarily()
  })

  useTVKeyListener(['OK', 'ENTER'], () => {
    if (showSettings) {
      setShowSettings(false)
    } else {
      togglePlayPause()
    }
    showControlsTemporarily()
  })

  useTVKeyListener(['YELLOW'], () => {
    setShowSettings(!showSettings)
    showControlsTemporarily()
  })

  // Handle Back navigation
  useBackNavigation(() => {
    if (showSettings) {
      setShowSettings(false)
    } else {
      onBack()
    }
  })

  // Episode navigation
  const playNextEpisode = useCallback(() => {
    const currentIndex = episodes.findIndex(ep => ep.id === episode.id)
    if (currentIndex < episodes.length - 1) {
      onEpisodeChange(episodes[currentIndex + 1])
    }
  }, [episode.id, episodes, onEpisodeChange])

  const playPreviousEpisode = useCallback(() => {
    const currentIndex = episodes.findIndex(ep => ep.id === episode.id)
    if (currentIndex > 0) {
      onEpisodeChange(episodes[currentIndex - 1])
    }
  }, [episode.id, episodes, onEpisodeChange])

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Mouse movement handler
  const handleMouseMove = useCallback(() => {
    showControlsTemporarily()
  }, [showControlsTemporarily])

  return (
    <div 
      className="relative w-full h-screen bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        preload="metadata"
        playsInline
      />

      {/* Buffering Indicator */}
      {playerState.isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Controls Overlay */}
      <AnimatePresence>
        {playerState.showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/50"
          >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-8 flex items-center justify-between">
              <button 
                className="focusable p-3 rounded-lg bg-surface-elevated/80 backdrop-blur-sm"
                onClick={onBack}
              >
                <ArrowLeft size={24} />
              </button>
              
              <div className="text-center">
                <h1 className="text-tv-2xl font-bold text-white">{episode.title}</h1>
                <p className="text-tv-base text-text-secondary">Episode {episode.number}</p>
              </div>
              
              <button 
                className="focusable p-3 rounded-lg bg-surface-elevated/80 backdrop-blur-sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={24} />
              </button>
            </div>

            {/* Center Controls */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center space-x-8">
                <button 
                  className="focusable p-4 rounded-full bg-surface-elevated/80 backdrop-blur-sm"
                  onClick={playPreviousEpisode}
                  disabled={episodes.findIndex(ep => ep.id === episode.id) === 0}
                >
                  <SkipBack size={32} />
                </button>
                
                <button 
                  className="focusable p-6 rounded-full bg-accent"
                  onClick={togglePlayPause}
                >
                  {playerState.isPlaying ? <Pause size={40} /> : <Play size={40} />}
                </button>
                
                <button 
                  className="focusable p-4 rounded-full bg-surface-elevated/80 backdrop-blur-sm"
                  onClick={playNextEpisode}
                  disabled={episodes.findIndex(ep => ep.id === episode.id) === episodes.length - 1}
                >
                  <SkipForward size={32} />
                </button>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-8">
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="relative h-2 bg-white/20 rounded-full">
                  <div 
                    className="absolute left-0 top-0 h-full bg-accent rounded-full transition-all duration-100"
                    style={{ width: `${(playerState.currentTime / playerState.duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-tv-sm text-text-secondary">
                  <span>{formatTime(playerState.currentTime)}</span>
                  <span>{formatTime(playerState.duration)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <button 
                    className="focusable p-3 rounded-lg"
                    onClick={() => seek(-10)}
                  >
                    <RotateCcw size={24} />
                  </button>
                  
                  <button 
                    className="focusable p-3 rounded-lg"
                    onClick={() => seek(10)}
                  >
                    <RotateCw size={24} />
                  </button>
                </div>

                <div className="flex items-center space-x-4">
                  <button 
                    className="focusable p-3 rounded-lg flex items-center space-x-2"
                    onClick={toggleMute}
                  >
                    {playerState.isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                    <span className="text-tv-sm">{Math.round(playerState.volume * 100)}%</span>
                  </button>
                  
                  <button 
                    className="focusable p-3 rounded-lg"
                    onClick={toggleFullscreen}
                  >
                    {playerState.isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="absolute top-0 right-0 bottom-0 w-96 bg-surface-elevated/95 backdrop-blur-md p-8 space-y-6"
          >
            <h2 className="text-tv-2xl font-bold text-white">Player Settings</h2>
            
            {/* Quality Settings */}
            <div>
              <h3 className="text-tv-lg font-semibold text-white mb-4">Quality</h3>
              <div className="space-y-2">
                {['auto', '1080p', '720p', '480p'].map((quality) => (
                  <button
                    key={quality}
                    className={`w-full text-left p-3 rounded-lg focusable ${
                      selectedQuality === quality ? 'bg-accent' : 'bg-surface hover:bg-surface-hover'
                    }`}
                    onClick={() => setSelectedQuality(quality)}
                  >
                    {quality}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitle Settings */}
            <div>
              <h3 className="text-tv-lg font-semibold text-white mb-4">Subtitles</h3>
              <div className="space-y-2">
                <button
                  className={`w-full text-left p-3 rounded-lg focusable ${
                    selectedSubtitle === 'off' ? 'bg-accent' : 'bg-surface hover:bg-surface-hover'
                  }`}
                  onClick={() => setSelectedSubtitle('off')}
                >
                  Off
                </button>
                {episode.subtitles?.map((subtitle) => (
                  <button
                    key={subtitle.language}
                    className={`w-full text-left p-3 rounded-lg focusable ${
                      selectedSubtitle === subtitle.language ? 'bg-accent' : 'bg-surface hover:bg-surface-hover'
                    }`}
                    onClick={() => setSelectedSubtitle(subtitle.language)}
                  >
                    {subtitle.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}