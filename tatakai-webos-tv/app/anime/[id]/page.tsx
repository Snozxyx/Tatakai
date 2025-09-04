'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { Play, Plus, ArrowLeft, Star, Clock, Calendar, List } from 'lucide-react'
import { apiClient, queryKeys } from '../../../lib/api-client'
import { useFocusManagement } from '../../../lib/focus-management'
import { useEffect } from 'react'

export default function AnimeDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { setInitialFocus } = useFocusManagement()
  const animeId = params.id as string

  // Fetch anime details
  const { data: animeDetails, isLoading: isLoadingDetails, error: detailsError } = useQuery({
    queryKey: queryKeys.animeDetails(animeId),
    queryFn: () => apiClient.getAnimeDetails(animeId),
    enabled: !!animeId,
  })

  // Fetch anime episodes
  const { data: episodeData, isLoading: isLoadingEpisodes } = useQuery({
    queryKey: queryKeys.animeEpisodes(animeId),
    queryFn: () => apiClient.getAnimeEpisodes(animeId),
    enabled: !!animeId,
  })

  // Set initial focus when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialFocus()
    }, 500)
    
    return () => clearTimeout(timer)
  }, [setInitialFocus])

  const handlePlay = () => {
    if (episodeData?.episodes && episodeData.episodes.length > 0) {
      const firstEpisode = episodeData.episodes[0]
      router.push(`/watch/${animeId}/s1e${firstEpisode.number}`)
    }
  }

  const handleAddToWatchlist = () => {
    console.log('Add to watchlist:', animeId)
    // TODO: Implement watchlist functionality
  }

  const handleBack = () => {
    router.back()
  }

  const handleEpisodeSelect = (episodeNumber: number) => {
    router.push(`/watch/${animeId}/s1e${episodeNumber}`)
  }

  if (isLoadingDetails) {
    return (
      <div className="min-h-screen bg-background">
        <div className="tv-safe py-8">
          <div className="animate-pulse space-y-8">
            {/* Back button skeleton */}
            <div className="h-12 w-24 bg-card rounded"></div>
            
            {/* Hero section skeleton */}
            <div className="flex gap-8">
              <div className="w-80 h-96 bg-card rounded-lg"></div>
              <div className="flex-1 space-y-4">
                <div className="h-12 bg-card rounded w-3/4"></div>
                <div className="h-6 bg-card rounded w-1/2"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-card rounded"></div>
                  <div className="h-4 bg-card rounded"></div>
                  <div className="h-4 bg-card rounded w-3/4"></div>
                </div>
                <div className="flex gap-4">
                  <div className="h-14 w-32 bg-card rounded"></div>
                  <div className="h-14 w-40 bg-card rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (detailsError || !animeDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl text-error">Error Loading Anime</div>
          <div className="text-lg text-text-secondary">
            Could not load anime details. Please try again.
          </div>
          <div className="flex gap-4 justify-center">
            <button className="btn-secondary focusable" onClick={handleBack}>
              Go Back
            </button>
            <button 
              className="btn-primary focusable"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative">
        {/* Background Image */}
        <div className="absolute inset-0 h-screen">
          <img
            src={animeDetails.poster || '/placeholder-banner.jpg'}
            alt={animeDetails.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="relative z-10 tv-safe py-8">
          {/* Back Button */}
          <button
            className="control-btn focusable mb-8"
            onClick={handleBack}
            aria-label="Back to previous page"
          >
            <ArrowLeft size={24} />
          </button>

          {/* Anime Details */}
          <div className="flex gap-8 items-start">
            {/* Poster */}
            <div className="flex-shrink-0">
              <img
                src={animeDetails.poster}
                alt={animeDetails.name}
                className="w-80 h-96 object-cover rounded-lg shadow-xl"
              />
            </div>

            {/* Info */}
            <div className="flex-1 space-y-6 max-w-3xl">
              {/* Title */}
              <div>
                <h1 className="text-tv-4xl font-bold text-white mb-2">
                  {animeDetails.name}
                </h1>
                {animeDetails.jname && (
                  <h2 className="text-tv-lg text-text-secondary">
                    {animeDetails.jname}
                  </h2>
                )}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-6 text-text-secondary">
                <div className="flex items-center gap-2">
                  <Star className="text-yellow-400 fill-current" size={20} />
                  <span className="text-tv-base">{animeDetails.malscore || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={20} />
                  <span className="text-tv-base">{animeDetails.aired}</span>
                </div>
                <div className="flex items-center gap-2">
                  <List size={20} />
                  <span className="text-tv-base">{animeDetails.episodes.sub} Episodes</span>
                </div>
                <div className="px-3 py-1 bg-accent rounded-full">
                  <span className="text-white font-medium">{animeDetails.type}</span>
                </div>
                <div className="px-3 py-1 bg-card rounded-full">
                  <span className="text-white">{animeDetails.status}</span>
                </div>
              </div>

              {/* Genres */}
              <div className="flex flex-wrap gap-2">
                {animeDetails.genres.map((genre, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-card/50 border border-border rounded-full text-tv-sm text-text-secondary"
                  >
                    {genre}
                  </span>
                ))}
              </div>

              {/* Description */}
              <p className="text-tv-lg text-text-secondary leading-relaxed line-clamp-4">
                {animeDetails.description}
              </p>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  className="btn-primary focusable flex items-center gap-3"
                  onClick={handlePlay}
                  disabled={!episodeData?.episodes || episodeData.episodes.length === 0}
                >
                  <Play size={24} fill="currentColor" />
                  <span>Play Episode 1</span>
                </button>

                <button
                  className="btn-secondary focusable flex items-center gap-3"
                  onClick={handleAddToWatchlist}
                >
                  <Plus size={24} />
                  <span>Add to Watchlist</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Episodes Section */}
      {episodeData && episodeData.episodes.length > 0 && (
        <div className="tv-safe py-8">
          <h3 className="text-tv-2xl font-semibold text-white mb-6">
            Episodes ({episodeData.totalEpisodes})
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {episodeData.episodes.slice(0, 12).map((episode) => (
              <button
                key={episode.number}
                className="bg-card hover:bg-card-hover border border-border rounded-lg p-4 text-left transition-all focusable"
                onClick={() => handleEpisodeSelect(episode.number)}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-tv-base font-semibold text-accent">
                    Episode {episode.number}
                  </span>
                  {episode.isFiller && (
                    <span className="px-2 py-1 bg-warning/20 text-warning text-xs rounded">
                      Filler
                    </span>
                  )}
                </div>
                <h4 className="text-tv-base text-white font-medium mb-1 line-clamp-2">
                  {episode.title}
                </h4>
                <div className="flex items-center gap-2 text-text-secondary text-tv-sm">
                  <Clock size={16} />
                  <span>24 min</span>
                </div>
              </button>
            ))}
          </div>

          {episodeData.episodes.length > 12 && (
            <div className="text-center mt-8">
              <button className="btn-secondary focusable">
                View All Episodes ({episodeData.totalEpisodes})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}