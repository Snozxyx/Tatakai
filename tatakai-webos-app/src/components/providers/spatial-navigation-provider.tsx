'use client'

import { useEffect } from 'react'

interface SpatialNavigationProviderProps {
  children: React.ReactNode
}

export function SpatialNavigationProvider({ children }: SpatialNavigationProviderProps) {
  useEffect(() => {
    // Initialize webOS APIs if available
    if (typeof window !== 'undefined') {
      // Check if webOS APIs are available
      if (window.webOS) {
        console.log('webOS APIs detected')
        // Initialize webOS services
      } else {
        console.log('Running in development mode')
      }

      // Handle remote control keys
      const handleKeyDown = (event: KeyboardEvent) => {
        // WebOS TV remote key codes
        switch (event.keyCode) {
          case 37: // Left arrow
          case 38: // Up arrow
          case 39: // Right arrow
          case 40: // Down arrow
          case 13: // Enter/OK
            // Basic keyboard navigation for now
            break
          case 461: // Back button
          case 8:   // Backspace (fallback)
            event.preventDefault()
            // Handle back navigation
            if (window.webOS?.platformBack) {
              window.webOS.platformBack()
            } else {
              window.history.back()
            }
            break
          case 172: // Red button
            // Search functionality
            break
          case 175: // Blue button
            // Categories/Menu
            break
          case 415: // Play
          case 19:  // Pause
          case 413: // Stop
          case 412: // Rewind
          case 417: // Fast Forward
            // Media controls
            event.preventDefault()
            break
          default:
            console.log('Unhandled key:', event.keyCode)
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [])

  return <>{children}</>
}

// Extend window interface for webOS APIs
declare global {
  interface Window {
    webOS?: {
      platformBack?: () => void
      deviceInfo?: (callback: (info: any) => void) => void
      service?: {
        request: (service: string, params: any) => void
      }
    }
  }
}