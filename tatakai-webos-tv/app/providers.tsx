'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FocusProvider } from '../lib/focus-management'
import { useRemoteKeyHandler, useFocusManagement } from '../lib/focus-management'
import { useWebOS } from '../lib/webos-integration'
import { useEffect, useState } from 'react'

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // TV-optimized query options
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})

function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const { isReady, webOS } = useWebOS()
  
  // Initialize focus management
  useFocusManagement()
  
  // Handle remote key events
  useRemoteKeyHandler()

  useEffect(() => {
    if (isReady) {
      // Hide cursor on TV
      if (webOS.isWebOSTV()) {
        webOS.setCursorVisibility(false)
        webOS.preventScreenSaver()
      }
      
      setIsInitialized(true)
    }
  }, [isReady, webOS])

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl font-bold text-accent">Tatakai</div>
          <div className="text-xl text-text-secondary">Loading...</div>
          <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <FocusProvider>
        <AppInitializer>
          {children}
        </AppInitializer>
      </FocusProvider>
    </QueryClientProvider>
  )
}