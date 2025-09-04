'use client'

import { useState } from 'react'
import { Play, Plus, Info, Star } from 'lucide-react'
import { AnimeBase } from '../../lib/api-client'
import { motion } from 'framer-motion'

interface AnimeCardProps {
  anime: AnimeBase
  index: number
  showRanking?: boolean
  onFocus: () => void
  focusId: string
}

export function AnimeCard({ anime, index, showRanking = false, onFocus, focusId }: AnimeCardProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const handleCardClick = () => {
    // Navigate to anime details page
    window.location.href = `/anime/${anime.id}`
  }

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Navigate directly to player (assuming episode 1)
    window.location.href = `/watch/${anime.id}/s1e1`
  }

  const handleAddToListClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('Add to list:', anime.name)
    // TODO: Add to watchlist
  }

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('Info clicked:', anime.name)
    // TODO: Show quick info or navigate to details
  }

  return (
    <motion.div
      className="anime-card group cursor-pointer relative"
      onClick={handleCardClick}
      onFocus={() => {
        setIsFocused(true)
        onFocus()
      }}
      onBlur={() => setIsFocused(false)}
      tabIndex={0}
      role="button"
      aria-label={`${anime.name} - ${anime.type} - ${anime.episodes.sub} episodes`}
      data-focus-id={focusId}
      whileHover={{ scale: 1.05 }}
      whileFocus={{ scale: 1.05 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Ranking Badge */}
      {showRanking && (
        <div className="absolute top-2 left-2 z-20 bg-accent text-white text-sm font-bold px-2 py-1 rounded">
          #{index + 1}
        </div>
      )}

      {/* Poster Image */}
      <div className="relative aspect-poster overflow-hidden rounded-lg bg-card">
        {!isImageLoaded && (
          <div className="absolute inset-0 bg-card animate-pulse flex items-center justify-center">
            <div className="text-text-muted">Loading...</div>
          </div>
        )}
        
        <img
          src={anime.poster}
          alt={anime.name}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isImageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => setIsImageLoaded(true)}
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-300" />

        {/* Action Buttons - Appear on Focus/Hover */}
        <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 group-focus:translate-y-0">
          <div className="flex items-center justify-between">
            <button
              className="p-2 rounded-full bg-white text-black hover:bg-accent hover:text-white transition-colors duration-200 focusable"
              onClick={handlePlayClick}
              aria-label={`Play ${anime.name}`}
            >
              <Play size={16} fill="currentColor" />
            </button>
            
            <div className="flex space-x-1">
              <button
                className="p-2 rounded-full bg-black/50 text-white hover:bg-accent transition-colors duration-200 focusable"
                onClick={handleAddToListClick}
                aria-label={`Add ${anime.name} to list`}
              >
                <Plus size={16} />
              </button>
              
              <button
                className="p-2 rounded-full bg-black/50 text-white hover:bg-accent transition-colors duration-200 focusable"
                onClick={handleInfoClick}
                aria-label={`More info about ${anime.name}`}
              >
                <Info size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Episode Count Badge */}
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {anime.episodes.sub} EP
          {anime.episodes.dub > 0 && (
            <span className="ml-1 text-accent">DUB</span>
          )}
        </div>
      </div>

      {/* Card Info */}
      <div className="pt-3 space-y-1">
        {/* Title */}
        <h3 className="text-tv-base font-medium text-white line-clamp-2 group-hover:text-accent group-focus:text-accent transition-colors">
          {anime.name}
        </h3>

        {/* Type and Year */}
        <div className="flex items-center space-x-2 text-text-secondary text-tv-sm">
          <span>{anime.type}</span>
          {/* Rating Stars (placeholder) */}
          <div className="flex items-center">
            <Star size={12} className="text-yellow-400 fill-current" />
            <span className="ml-1">4.5</span>
          </div>
        </div>
      </div>

      {/* Focus Ring */}
      {isFocused && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-background pointer-events-none" />
      )}
    </motion.div>
  )
}