'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, ArrowLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiClient, queryKeys, AnimeBase } from '../../lib/api-client'
import { AnimeCard } from '../cards/anime-card'
import { useFocusManagement } from '../../lib/focus-management'

interface SearchPageProps {
  onClose: () => void
}

export function SearchPage({ onClose }: SearchPageProps) {
  const [query, setQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { setInitialFocus } = useFocusManagement()

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query)
      setCurrentPage(1)
    }, 500)

    return () => clearTimeout(timer)
  }, [query])

  // Focus search input on mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [])

  // Search API call
  const { data: searchResults, isLoading, error } = useQuery({
    queryKey: queryKeys.search(debouncedQuery, currentPage),
    queryFn: () => apiClient.searchAnime(debouncedQuery, currentPage),
    enabled: debouncedQuery.length > 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }

  const handleClearSearch = () => {
    setQuery('')
    setDebouncedQuery('')
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }

  const handleLoadMore = () => {
    if (searchResults?.hasNextPage) {
      setCurrentPage(prev => prev + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="tv-safe py-6 border-b border-border/20">
        <div className="flex items-center space-x-6">
          {/* Back Button */}
          <button
            className="control-btn focusable"
            onClick={onClose}
            aria-label="Back to home"
          >
            <ArrowLeft size={24} />
          </button>

          {/* Search Input */}
          <div className="flex-1 relative max-w-2xl">
            <div className="relative">
              <Search size={24} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Search anime..."
                className="w-full pl-14 pr-14 py-4 bg-card border border-border rounded-lg text-tv-lg text-white placeholder-text-secondary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
                aria-label="Search anime"
              />
              {query && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-white focusable"
                  aria-label="Clear search"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Search Stats */}
          {searchResults && (
            <div className="text-tv-base text-text-secondary">
              Page {currentPage} of {searchResults.totalPages}
            </div>
          )}
        </div>
      </div>

      {/* Search Results */}
      <div className="tv-safe py-8">
        {/* Loading State */}
        {isLoading && debouncedQuery && (
          <div className="text-center py-16">
            <div className="text-tv-xl text-text-secondary mb-4">Searching...</div>
            <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-16">
            <div className="text-tv-xl text-error mb-4">Search Error</div>
            <div className="text-tv-base text-text-secondary mb-6">
              Unable to search at this time. Please try again.
            </div>
            <button
              className="btn-primary focusable"
              onClick={() => setDebouncedQuery(query)}
            >
              Retry Search
            </button>
          </div>
        )}

        {/* No Query State */}
        {!debouncedQuery && (
          <div className="text-center py-16">
            <Search size={64} className="mx-auto text-text-muted mb-4" />
            <div className="text-tv-xl text-text-secondary mb-4">Search Anime</div>
            <div className="text-tv-base text-text-muted">
              Enter at least 3 characters to search
            </div>
          </div>
        )}

        {/* No Results State */}
        {searchResults?.animes.length === 0 && debouncedQuery && !isLoading && (
          <div className="text-center py-16">
            <div className="text-tv-xl text-text-secondary mb-4">No Results Found</div>
            <div className="text-tv-base text-text-muted mb-6">
              No anime found for "{debouncedQuery}"
            </div>
            <button
              className="btn-secondary focusable"
              onClick={handleClearSearch}
            >
              Clear Search
            </button>
          </div>
        )}

        {/* Search Results Grid */}
        {searchResults?.animes && searchResults.animes.length > 0 && (
          <div className="space-y-8">
            {/* Results Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-tv-2xl font-semibold text-white">
                Search Results for "{debouncedQuery}"
              </h2>
              <div className="text-tv-base text-text-secondary">
                {searchResults.animes.length} results
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
              {searchResults.animes.map((anime, index) => (
                <AnimeCard
                  key={anime.id}
                  anime={anime}
                  index={index}
                  onFocus={() => {}}
                  focusId={`search-result-${index}`}
                />
              ))}
            </div>

            {/* Load More Button */}
            {searchResults.hasNextPage && (
              <div className="text-center pt-8">
                <button
                  className="btn-secondary focusable"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Load More Results'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TV Remote Instructions */}
      <div className="fixed bottom-4 right-4 bg-black/80 rounded-lg p-4 text-sm space-y-2">
        <div className="text-white font-semibold">Search Controls:</div>
        <div className="text-text-secondary">
          <div>↑↓ Navigate results</div>
          <div>OK Select anime</div>
          <div>Back Return to home</div>
        </div>
      </div>
    </div>
  )
}