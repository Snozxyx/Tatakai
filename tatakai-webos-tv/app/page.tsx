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
        <div className="tv-safe pt-24">
          {/* Hero skeleton */}
          <div className="space-y-8">
            <div className="h-[70vh] bg-surface skeleton rounded-lg relative overflow-hidden">
              {/* Hero content skeleton */}
              <div className="absolute bottom-24 left-8 space-y-6 max-w-2xl">
                <div className="h-16 w-96 bg-surface-elevated skeleton rounded-lg"></div>
                <div className="space-y-3">
                  <div className="h-6 w-full bg-surface-elevated skeleton rounded"></div>
                  <div className="h-6 w-4/5 bg-surface-elevated skeleton rounded"></div>
                  <div className="h-6 w-3/5 bg-surface-elevated skeleton rounded"></div>
                </div>
                <div className="flex space-x-4">
                  <div className="h-16 w-32 bg-surface-elevated skeleton rounded-lg"></div>
                  <div className="h-16 w-32 bg-surface-elevated skeleton rounded-lg"></div>
                </div>
              </div>
            </div>
            
            {/* Rows skeleton */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-6">
                <div className="h-10 bg-surface skeleton rounded w-64"></div>
                <div className="flex space-x-6">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div
                      key={j}
                      className="w-56 h-80 bg-surface skeleton rounded-lg flex-shrink-0"
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
        <div className="text-center space-y-6 tv-safe">
          <div className="text-tv-4xl text-error font-bold">Error Loading Content</div>
          <div className="text-tv-lg text-text-secondary max-w-2xl">
            Please check your internet connection and try again. If the problem persists, 
            contact support for assistance.
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
      <div className="pt-24">
        <Hero spotlightAnimes={homeData.spotlightAnimes} />
      </div>
      
      {/* Content Rows */}
      <ContentRows homeData={homeData} />
    </div>
  )
}