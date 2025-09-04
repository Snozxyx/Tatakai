'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Settings, SkipForward, SkipBack, Maximize } from 'lucide-react'
import { apiClient, queryKeys } from '../../../../lib/api-client'
import { useTVKeyListener } from '../../../../lib/focus-management'

export default function WatchPage() {
  const params = useParams()
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const animeId = params.id as string
  const episodeParam = params.episode as string
  
  // Parse episode info (e.g., "s1e1" -> season 1, episode 1)
  const episodeMatch = episodeParam.match(/s(\d+)e(\d+)/)
  const episodeNumber = episodeMatch ? parseInt(episodeMatch[2]) : 1

  // Fetch anime details
  const { data: animeDetails } = useQuery({
    queryKey: queryKeys.animeDetails(animeId),
    queryFn: () => apiClient.getAnimeDetails(animeId),
    enabled: !!animeId,
  })

  // Fetch episodes
  const { data: episodeData } = useQuery({
    queryKey: queryKeys.animeEpisodes(animeId),
    queryFn: () => apiClient.getAnimeEpisodes(animeId),
    enabled: !!animeId,
  })

  // Get current episode info
  const currentEpisode = episodeData?.episodes.find(ep => ep.number === episodeNumber)
  
  // For demo purposes, using a sample video URL
  // In real implementation, you'd fetch streaming data from API
  const videoUrl = 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'

  // Handle media key events
  useTVKeyListener(['PLAY_PAUSE', 'BACK', 'LEFT', 'RIGHT'], (key) => {
    switch (key) {
      case 'PLAY_PAUSE':
        togglePlayPause()
        break
      case 'BACK':
        handleBack()
        break
      case 'LEFT':
        seekBackward()
        break
      case 'RIGHT':
        seekForward()
        break
    }
  })

  // Auto-hide controls
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowControls(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [showControls])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleDurationChange = () => setDuration(video.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [])

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
    setShowControls(true)
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return

    video.muted = !video.muted
    setIsMuted(!isMuted)
    setShowControls(true)
  }

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current
    if (!video) return

    video.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
    setShowControls(true)
  }

  const seekTo = (time: number) => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = time
    setShowControls(true)
  }

  const seekForward = () => {
    seekTo(currentTime + 10)
  }

  const seekBackward = () => {
    seekTo(currentTime - 10)
  }

  const handleBack = () => {
    router.back()
  }

  const handleNextEpisode = () => {
    if (episodeData && episodeNumber < episodeData.totalEpisodes) {
      router.push(`/watch/${animeId}/s1e${episodeNumber + 1}`)
    }
  }

  const handlePrevEpisode = () => {
    if (episodeNumber > 1) {
      router.push(`/watch/${animeId}/s1e${episodeNumber - 1}`)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Video Player */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          poster={animeDetails?.poster}
          onClick={() => setShowControls(true)}
          onMouseMove={() => setShowControls(true)}
        />

        {/* Loading State */}
        {!videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div className="text-tv-lg text-white">Loading Episode...</div>
            </div>
          </div>
        )}

        {/* Play/Pause Overlay */}
        {!isPlaying && (
          <button
            className="absolute inset-0 flex items-center justify-center bg-black/30 focusable"
            onClick={togglePlayPause}
          >
            <div className="bg-accent rounded-full p-6">
              <Play size={48} className="text-white fill-current ml-1" />
            </div>
          </button>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none">
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 p-6 pointer-events-auto">
              <div className="flex items-center justify-between">
                <button
                  className="control-btn focusable"
                  onClick={handleBack}
                  aria-label="Back"
                >
                  <ArrowLeft size={24} />
                </button>

                <div className="text-center">
                  <h1 className="text-tv-xl font-semibold text-white">
                    {animeDetails?.name}
                  </h1>
                  <p className="text-tv-base text-text-secondary">
                    {currentEpisode?.title || `Episode ${episodeNumber}`}
                  </p>
                </div>

                <div className="w-12"></div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-auto">
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="relative h-2 bg-white/20 rounded-full">
                  <div
                    className="absolute left-0 top-0 h-full bg-accent rounded-full transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                  <button
                    className="absolute top-1/2 w-4 h-4 bg-accent rounded-full transform -translate-y-1/2 focusable"
                    style={{ left: `${progressPercentage}%` }}
                    onClick={(e) => {
                      const rect = e.currentTarget.parentElement!.getBoundingClientRect()
                      const x = e.clientX - rect.left
                      const percentage = (x / rect.width) * 100
                      seekTo((percentage / 100) * duration)
                    }}
                  />
                </div>
                <div className="flex justify-between text-tv-sm text-text-secondary mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Previous Episode */}
                  <button
                    className="control-btn focusable"
                    onClick={handlePrevEpisode}
                    disabled={episodeNumber <= 1}
                    aria-label="Previous episode"
                  >
                    <SkipBack size={24} />
                  </button>

                  {/* Seek Backward */}
                  <button
                    className="control-btn focusable"
                    onClick={seekBackward}
                    aria-label="Seek backward 10 seconds"
                  >
                    <span className="text-tv-sm">-10s</span>
                  </button>

                  {/* Play/Pause */}
                  <button
                    className="control-btn focusable bg-accent"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                  </button>

                  {/* Seek Forward */}
                  <button
                    className="control-btn focusable"
                    onClick={seekForward}
                    aria-label="Seek forward 10 seconds"
                  >
                    <span className="text-tv-sm">+10s</span>
                  </button>

                  {/* Next Episode */}
                  <button
                    className="control-btn focusable"
                    onClick={handleNextEpisode}
                    disabled={!episodeData || episodeNumber >= episodeData.totalEpisodes}
                    aria-label="Next episode"
                  >
                    <SkipForward size={24} />
                  </button>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Volume */}
                  <div className="flex items-center space-x-2">
                    <button
                      className="control-btn focusable"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                    </button>
                    <div className="w-20 h-2 bg-white/20 rounded-full">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${volume * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Settings */}
                  <button
                    className="control-btn focusable"
                    aria-label="Settings"
                  >
                    <Settings size={24} />
                  </button>

                  {/* Fullscreen */}
                  <button
                    className="control-btn focusable"
                    onClick={toggleFullscreen}
                    aria-label="Toggle fullscreen"
                  >
                    <Maximize size={24} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TV Remote Instructions */}
      {showControls && (
        <div className="absolute bottom-20 left-6 bg-black/80 rounded-lg p-3 text-sm space-y-1">
          <div className="text-white font-semibold">Player Controls:</div>
          <div className="text-text-secondary">
            <div>Play/Pause Media key</div>
            <div>← → Seek 10s</div>
            <div>Back Exit player</div>
          </div>
        </div>
      )}
    </div>
  )
}