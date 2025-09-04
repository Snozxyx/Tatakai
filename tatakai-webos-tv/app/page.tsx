'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient, queryKeys } from '../lib/api-client'
import { Header } from '../components/layout/header'
import { Hero } from '../components/hero/hero'
import { ContentRows } from '../components/rows/content-rows'
import { useFocusManagement } from '../lib/focus-management'
import { useEffect } from 'react'

export default function HomePage() {
  const { setInitialFocus } = useFocusManagement()
  
  // Fetch home page data
  const { data: homeData, isLoading, error } = useQuery({
    queryKey: queryKeys.homePage,
    queryFn: () => apiClient.getHomePage(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Set initial focus when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialFocus()
    }, 500)
    
    return () => clearTimeout(timer)
  }, [setInitialFocus])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="tv-safe">
          {/* Loading skeleton */}
          <div className="space-y-8">
            {/* Hero skeleton */}
            <div className="h-screen bg-card animate-pulse rounded-lg"></div>
            
            {/* Rows skeleton */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <div className="h-8 bg-card animate-pulse rounded w-64"></div>
                <div className="flex space-x-4">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div
                      key={j}
                      className="w-48 h-72 bg-card animate-pulse rounded-lg flex-shrink-0"
                    ></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl text-error">Error Loading Content</div>
          <div className="text-lg text-text-secondary">
            Please check your internet connection and try again
          </div>
          <button 
            className="btn-primary focusable"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!homeData) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <Hero spotlightAnimes={homeData.spotlightAnimes} />
      
      {/* Content Rows */}
      <ContentRows homeData={homeData} />
    </div>
  )
}