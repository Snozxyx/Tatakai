'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Plus, Info, Star } from 'lucide-react'
import { AnimeBase } from '../../lib/api-client'
import { motion } from 'framer-motion'
import { useFocusContext } from '../../lib/focus-management'

interface AnimeCardProps {
  anime: AnimeBase
  index: number
  showRanking?: boolean
  onFocus: () => void
  focusId: string
  sectionId?: string
}

export function AnimeCard({ 
  anime, 
  index, 
  showRanking = false, 
  onFocus, 
  focusId,
  sectionId = 'main'
}: AnimeCardProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const { addFocusable, removeFocusable } = useFocusContext()

  useEffect(() => {
    if (cardRef.current) {
      addFocusable(cardRef.current, sectionId)
      return () => {
        if (cardRef.current) {
          removeFocusable(cardRef.current)
        }
      }
    }
  }, [sectionId, addFocusable, removeFocusable])

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
      ref={cardRef}
      className="focusable-card group cursor-pointer relative w-56 flex-shrink-0"
      onClick={handleCardClick}
      onFocus={() => {
        setIsFocused(true)
        onFocus()
      }}
      onBlur={() => setIsFocused(false)}
      tabIndex={0}
      role="button"
      aria-label={`${anime.name} - ${anime.type} - ${anime.episodes.sub} episodes`}
      data-focusable="true"
      data-section={sectionId}
      data-nav-id={focusId}
      whileHover={{ scale: 1.05, y: -8 }}
      whileFocus={{ scale: 1.05, y: -8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Ranking Badge */}
      {showRanking && (
        <div className="absolute top-3 left-3 z-20 bg-accent text-white text-tv-sm font-bold px-3 py-1 rounded-lg shadow-lg">
          #{index + 1}
        </div>
      )}

      {/* Poster Image */}
      <div className="relative aspect-poster overflow-hidden rounded-xl bg-surface shadow-lg">
        {/* Image Loading Skeleton */}
        {!isImageLoaded && (
          <div className="absolute inset-0 skeleton flex items-center justify-center">
            <div className="text-text-muted text-tv-sm">Loading...</div>
          </div>
        )}
        
        <img
          src={anime.poster}
          alt={anime.name}
          className={`w-full h-full object-cover transition-all duration-500 ${
            isImageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
          }`}
          onLoad={() => setIsImageLoaded(true)}
          onError={() => setIsImageLoaded(true)}
        />

        {/* Enhanced Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all duration-300" />

        {/* Action Buttons with Better Positioning */}
        <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 group-focus:translate-y-0">
          <div className="flex items-center justify-between">
            <button
              className="btn-primary px-4 py-2 text-tv-sm rounded-lg shadow-lg"
              onClick={handlePlayClick}
              aria-label={`Play ${anime.name}`}
            >
              <Play size={18} fill="currentColor" className="mr-2" />
              Play
            </button>
            
            <div className="flex space-x-2">
              <button
                className="p-3 rounded-lg bg-surface-elevated/90 text-white hover:bg-accent transition-colors duration-200 backdrop-blur-sm"
                onClick={handleAddToListClick}
                aria-label={`Add ${anime.name} to list`}
              >
                <Plus size={18} />
              </button>
              
              <button
                className="p-3 rounded-lg bg-surface-elevated/90 text-white hover:bg-accent transition-colors duration-200 backdrop-blur-sm"
                onClick={handleInfoClick}
                aria-label={`More info about ${anime.name}`}
              >
                <Info size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Episode Count Badge with Better Styling */}
        <div className="absolute top-3 right-3 bg-surface-elevated/90 backdrop-blur-sm text-white text-tv-xs px-3 py-1 rounded-lg font-medium">
          {anime.episodes.sub} EP
          {anime.episodes.dub > 0 && (
            <span className="ml-2 text-accent font-bold">DUB</span>
          )}
        </div>

        {/* Quality Badge */}
        <div className="absolute bottom-3 right-3 bg-accent/90 text-white text-tv-xs px-2 py-1 rounded font-bold">
          HD
        </div>
      </div>

      {/* Enhanced Card Info */}
      <div className="pt-4 space-y-2">
        {/* Title with Better Typography */}
        <h3 className="text-tv-base font-semibold text-text-primary line-clamp-2 group-hover:text-accent group-focus:text-accent transition-colors leading-tight">
          {anime.name}
        </h3>

        {/* Metadata Row */}
        <div className="flex items-center justify-between text-text-secondary text-tv-sm">
          <span className="font-medium">{anime.type}</span>
          
          {/* Rating Stars */}
          <div className="flex items-center space-x-1">
            <Star size={14} className="text-yellow-400 fill-current" />
            <span className="font-medium">4.5</span>
          </div>
        </div>

        {/* Genre Tags (if available) - only show for detailed anime objects */}
        {(anime as any).genres && Array.isArray((anime as any).genres) && (anime as any).genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(anime as any).genres.slice(0, 2).map((genre: string, idx: number) => (
              <span 
                key={idx}
                className="px-2 py-1 bg-surface-elevated text-text-secondary text-tv-xs rounded font-medium"
              >
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Focus Ring */}
      {isFocused && (
        <motion.div 
          className="absolute inset-0 rounded-xl ring-3 ring-accent ring-offset-4 ring-offset-background pointer-events-none"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </motion.div>
  )
}