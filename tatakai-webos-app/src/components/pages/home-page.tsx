'use client'

import { useState, useEffect } from 'react'
import { AnimeAPI, type HomePageData, type AnimeInfo } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getImageUrl, cn } from '@/lib/utils'
import { Play, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'

interface SpotlightCarouselProps {
  animes: AnimeInfo[]
}

interface AnimeCardProps {
  anime: AnimeInfo
  onSelect?: () => void
  index?: number
}

function AnimeCard({ anime, onSelect, index = 0 }: AnimeCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group cursor-pointer focusable focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background rounded-lg"
      onClick={onSelect}
      tabIndex={0}
    >
      <Card className="overflow-hidden transition-all duration-300 group-hover:scale-105 group-focus:scale-105">
        <div className="aspect-poster relative">
          <img
            src={getImageUrl(anime.poster)}
            alt={anime.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
            <div className="absolute bottom-4 left-4 right-4">
              <h3 className="text-white font-medium text-sm line-clamp-2 mb-2">
                {anime.name}
              </h3>
              {anime.episodes && (
                <div className="flex gap-2 text-xs text-white/80">
                  {anime.episodes.sub > 0 && <span>SUB: {anime.episodes.sub}</span>}
                  {anime.episodes.dub > 0 && <span>DUB: {anime.episodes.dub}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function SpotlightCarousel({ animes }: SpotlightCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentAnime = animes[currentIndex] || animes[0]

  useEffect(() => {
    if (animes.length === 0) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % animes.length)
    }, 5000)

    return () => clearInterval(timer)
  }, [animes.length])

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + animes.length) % animes.length)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % animes.length)
  }

  if (!currentAnime) return null

  return (
    <div className="relative h-96 rounded-lg overflow-hidden mb-8">
      <div className="absolute inset-0">
        <img
          src={getImageUrl(currentAnime.poster)}
          alt={currentAnime.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>
      
      <div className="relative z-10 h-full flex items-center">
        <div className="p-8 max-w-2xl">
          <motion.h1 
            key={currentAnime.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-bold text-white mb-4"
          >
            {currentAnime.name}
          </motion.h1>
          
          {currentAnime.description && (
            <motion.p 
              key={`${currentAnime.id}-desc`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-white/90 text-lg leading-relaxed mb-6 line-clamp-3"
            >
              {currentAnime.description}
            </motion.p>
          )}
          
          <div className="flex gap-4">
            <Button size="lg" className="gap-2">
              <Play className="w-5 h-5" />
              Watch Now
            </Button>
            <Button variant="outline" size="lg" className="gap-2">
              <Info className="w-5 h-5" />
              More Info
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={goToPrevious}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors focusable focus:ring-2 focus:ring-accent"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={goToNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors focusable focus:ring-2 focus:ring-accent"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {animes.slice(0, 5).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={cn(
              "w-2 h-2 rounded-full transition-colors focusable focus:ring-1 focus:ring-white",
              index === currentIndex ? "bg-white" : "bg-white/50"
            )}
          />
        ))}
      </div>
    </div>
  )
}

function AnimeRail({ title, animes }: { title: string; animes: AnimeInfo[] }) {
  if (!animes?.length) return null

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-bold text-foreground mb-4">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {animes.slice(0, 8).map((anime, index) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            index={index}
            onSelect={() => console.log('Selected:', anime.name)}
          />
        ))}
      </div>
    </section>
  )
}

export function HomePage() {
  const [homeData, setHomeData] = useState<HomePageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        setLoading(true)
        const data = await AnimeAPI.getHomePage()
        setHomeData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load home data')
        console.error('Error fetching home data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchHomeData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading anime data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!homeData?.data) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <p className="text-muted-foreground">No data available</p>
      </div>
    )
  }

  const { data } = homeData

  return (
    <div className="space-y-8">
      {/* Spotlight Carousel */}
      {data.spotlightAnimes?.length > 0 && (
        <SpotlightCarousel animes={data.spotlightAnimes} />
      )}

      {/* Continue Watching - Placeholder for now */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
        <div className="bg-muted/20 rounded-lg p-8 text-center">
          <p className="text-muted-foreground">Sign in to see your continue watching list</p>
        </div>
      </section>

      {/* Anime Rails */}
      <AnimeRail title="Trending Now" animes={data.trendingAnimes} />
      <AnimeRail title="Latest Episodes" animes={data.latestEpisodeAnimes} />
      <AnimeRail title="Most Popular" animes={data.mostPopularAnimes} />
      <AnimeRail title="Top Airing" animes={data.topAiringAnimes} />
      <AnimeRail title="Most Favorite" animes={data.mostFavoriteAnimes} />
      <AnimeRail title="Recently Completed" animes={data.latestCompletedAnimes} />
    </div>
  )
}