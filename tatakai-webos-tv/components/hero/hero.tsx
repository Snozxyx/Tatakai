'use client'

import { useState, useEffect } from 'react'
import { Play, Plus, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { SpotlightAnime } from '../../lib/api-client'
import { motion, AnimatePresence } from 'framer-motion'

interface HeroProps {
  spotlightAnimes: SpotlightAnime[]
}

export function Hero({ spotlightAnimes }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  const currentAnime = spotlightAnimes[currentIndex]

  // Auto-rotate spotlight animes
  useEffect(() => {
    if (!isAutoPlaying || spotlightAnimes.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % spotlightAnimes.length)
    }, 8000) // 8 seconds per slide

    return () => clearInterval(interval)
  }, [isAutoPlaying, spotlightAnimes.length])

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % spotlightAnimes.length)
    setIsAutoPlaying(false)
  }

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + spotlightAnimes.length) % spotlightAnimes.length)
    setIsAutoPlaying(false)
  }

  const handlePlay = () => {
    console.log('Play clicked for:', currentAnime.name)
    // TODO: Navigate to player
  }

  const handleAddToWatchlist = () => {
    console.log('Add to watchlist:', currentAnime.name)
    // TODO: Add to watchlist
  }

  const handleMoreInfo = () => {
    console.log('More info for:', currentAnime.name)
    // TODO: Navigate to details page
  }

  if (!currentAnime) return null

  return (
    <section className="relative h-screen overflow-hidden pt-20">
      {/* Background Image with Parallax Effect */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <img
              src={currentAnime.poster}
              alt={currentAnime.name}
              className="w-full h-full object-cover"
            />
            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex items-center tv-safe">
        <div className="max-w-2xl space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-6"
            >
              {/* Rank Badge */}
              <div className="flex items-center space-x-4">
                <div className="bg-accent px-4 py-2 rounded-lg">
                  <span className="text-white font-bold">#{currentAnime.rank}</span>
                </div>
                <div className="text-accent font-semibold text-lg">
                  TRENDING NOW
                </div>
              </div>

              {/* Title */}
              <h1 className="hero-title">
                {currentAnime.name}
              </h1>

              {/* Japanese Title */}
              {currentAnime.jname && (
                <h2 className="text-tv-lg text-text-secondary font-medium">
                  {currentAnime.jname}
                </h2>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-4 text-text-secondary">
                <span className="text-tv-base">{currentAnime.type}</span>
                <span className="w-1 h-1 bg-text-secondary rounded-full"></span>
                <span className="text-tv-base">
                  {currentAnime.episodes.sub} Episodes
                </span>
                {currentAnime.episodes.dub > 0 && (
                  <>
                    <span className="w-1 h-1 bg-text-secondary rounded-full"></span>
                    <span className="text-tv-base">Dubbed</span>
                  </>
                )}
                {currentAnime.otherInfo.map((info, index) => (
                  <span key={index} className="text-tv-base">{info}</span>
                ))}
              </div>

              {/* Description */}
              <p className="hero-description">
                {currentAnime.description}
              </p>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <button
                  className="btn-primary focusable flex items-center space-x-3"
                  onClick={handlePlay}
                >
                  <Play size={24} fill="currentColor" />
                  <span>Play</span>
                </button>

                <button
                  className="btn-secondary focusable flex items-center space-x-3"
                  onClick={handleAddToWatchlist}
                >
                  <Plus size={24} />
                  <span>My List</span>
                </button>

                <button
                  className="btn-secondary focusable flex items-center space-x-3"
                  onClick={handleMoreInfo}
                >
                  <Info size={24} />
                  <span>More Info</span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Controls */}
      {spotlightAnimes.length > 1 && (
        <div className="absolute bottom-8 right-8 flex items-center space-x-4">
          {/* Previous Button */}
          <button
            className="control-btn focusable"
            onClick={prevSlide}
            aria-label="Previous anime"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Indicators */}
          <div className="flex space-x-2">
            {spotlightAnimes.map((_, index) => (
              <button
                key={index}
                className={`w-3 h-3 rounded-full transition-all duration-300 focusable ${
                  index === currentIndex
                    ? 'bg-accent scale-125'
                    : 'bg-white/30 hover:bg-white/50'
                }`}
                onClick={() => {
                  setCurrentIndex(index)
                  setIsAutoPlaying(false)
                }}
                aria-label={`Go to anime ${index + 1}`}
              />
            ))}
          </div>

          {/* Next Button */}
          <button
            className="control-btn focusable"
            onClick={nextSlide}
            aria-label="Next anime"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}

      {/* Auto-play Indicator */}
      {isAutoPlaying && spotlightAnimes.length > 1 && (
        <div className="absolute bottom-4 left-8">
          <div className="flex items-center space-x-2 text-text-secondary text-sm">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
            <span>Auto-playing</span>
          </div>
        </div>
      )}
    </section>
  )
}