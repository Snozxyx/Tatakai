'use client'

import { useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimeBase } from '../../lib/api-client'
import { AnimeCard } from '../cards/anime-card'
import { useFocusContext } from '../../lib/focus-management'

interface AnimeRowProps {
  title: string
  animes: AnimeBase[]
  rowId: string
  showRankings?: boolean
}

export function AnimeRow({ title, animes, rowId, showRankings = false }: AnimeRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { focusNext, focusPrev } = useFocusContext()

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const cardWidth = 240 // Approximate card width + gap
      const scrollAmount = cardWidth * 3 // Scroll 3 cards at a time
      
      container.scrollBy({
        left: -scrollAmount,
        behavior: 'smooth'
      })
    }
  }, [])

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const cardWidth = 240
      const scrollAmount = cardWidth * 3
      
      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      })
    }
  }, [])

  const handleCardFocus = useCallback((index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const cardWidth = 240
      const containerWidth = container.clientWidth
      const cardLeft = index * cardWidth
      const cardRight = cardLeft + cardWidth
      const scrollLeft = container.scrollLeft
      const scrollRight = scrollLeft + containerWidth

      // Auto-scroll to keep focused card in view
      if (cardLeft < scrollLeft) {
        container.scrollTo({
          left: cardLeft - cardWidth,
          behavior: 'smooth'
        })
      } else if (cardRight > scrollRight) {
        container.scrollTo({
          left: cardRight - containerWidth + cardWidth,
          behavior: 'smooth'
        })
      }
    }
  }, [])

  if (!animes.length) return null

  return (
    <section className="content-row" data-row-id={rowId}>
      {/* Row Header */}
      <div className="flex items-center justify-between mb-4 tv-safe-x">
        <h2 className="row-title">{title}</h2>
        
        {/* Navigation Buttons */}
        <div className="flex items-center space-x-2">
          <button
            className="control-btn focusable"
            onClick={scrollLeft}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="control-btn focusable"
            onClick={scrollRight}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Carousel Container */}
      <div 
        ref={scrollContainerRef}
        className="carousel-container tv-safe-x"
        role="list"
        aria-label={title}
      >
        {animes.map((anime, index) => (
          <div
            key={`${rowId}-${anime.id}`}
            className="carousel-item"
            role="listitem"
          >
            <AnimeCard
              anime={anime}
              index={index}
              showRanking={showRankings}
              onFocus={() => handleCardFocus(index)}
              focusId={`${rowId}-card-${index}`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}