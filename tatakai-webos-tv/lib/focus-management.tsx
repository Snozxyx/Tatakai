'use client'

import { useEffect, useRef, useCallback } from 'react'
import { init, setKeyMap, setFocus, getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation'

// Enhanced spatial navigation setup for TV
let spatialNavInitialized = false

export function initSpatialNavigation() {
  if (spatialNavInitialized) return
  
  // Initialize spatial navigation
  init({
    debug: process.env.NODE_ENV === 'development',
    visualDebug: process.env.NODE_ENV === 'development'
  })

  // Set up webOS key mapping
  setKeyMap({
    'left': [37, 4], // Arrow left, webOS left
    'up': [38, 1], // Arrow up, webOS up
    'right': [39, 2], // Arrow right, webOS right
    'down': [40, 3], // Arrow down, webOS down
    'enter': [13, 23], // Enter, webOS OK
  })

  spatialNavInitialized = true
}

// Enhanced focus management hook with spatial navigation
export function useFocusManagement() {
  const isInitialized = useRef(false)

  useEffect(() => {
    if (!isInitialized.current) {
      initSpatialNavigation()
      isInitialized.current = true
    }
  }, [])

  const setInitialFocus = useCallback((selector?: string) => {
    setTimeout(() => {
      if (selector) {
        const element = document.querySelector(selector) as HTMLElement
        if (element) {
          // Get the focusable ID for spatial navigation
          const focusId = element.getAttribute('data-nav-id') || selector
          setFocus(focusId)
        }
      } else {
        // Focus first focusable element in the current section
        const firstFocusable = document.querySelector('[data-focusable="true"]') as HTMLElement
        if (firstFocusable) {
          const focusId = firstFocusable.getAttribute('data-nav-id')
          if (focusId) {
            setFocus(focusId)
          }
        }
      }
    }, 200) // Increased delay for better initialization
  }, [])

  const focusElement = useCallback((selector: string) => {
    const element = document.querySelector(selector) as HTMLElement
    if (element) {
      const focusId = element.getAttribute('data-nav-id') || selector
      setFocus(focusId)
    }
  }, [])

  const getCurrentFocus = useCallback(() => {
    return getCurrentFocusKey()
  }, [])

  return {
    setInitialFocus,
    focusElement,
    getCurrentFocus,
    isInitialized: isInitialized.current
  }
}

// TV Remote key mapping - Enhanced for webOS
export const TV_KEYS = {
  // Arrow keys
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  
  // Action keys
  OK: 13,
  ENTER: 13,
  BACK: 8,
  ESCAPE: 27,
  HOME: 36,
  
  // Media keys (webOS specific)
  PLAY_PAUSE: 415,
  PLAY: 19,
  PAUSE: 19,
  STOP: 413,
  REWIND: 412,
  FAST_FORWARD: 417,
  
  // Color keys (webOS)
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  
  // Number keys
  NUM_0: 48,
  NUM_1: 49,
  NUM_2: 50,
  NUM_3: 51,
  NUM_4: 52,
  NUM_5: 53,
  NUM_6: 54,
  NUM_7: 55,
  NUM_8: 56,
  NUM_9: 57,
  
  // webOS specific keys
  EXIT: 10001,
  MENU: 10002,
  INFO: 10003,
  GUIDE: 10004,
  CHANNEL_UP: 427,
  CHANNEL_DOWN: 428,
  VOLUME_UP: 447,
  VOLUME_DOWN: 448,
  MUTE: 449
} as const

export type TVKey = keyof typeof TV_KEYS

// Enhanced remote key handler with better webOS support
export function useRemoteKeyHandler() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const keyCode = event.keyCode || event.which
    
    // Get webOS specific key handling
    if (typeof window !== 'undefined' && (window as any).webOS) {
      // webOS specific key handling
      const webOSKeys = [403, 404, 405, 406, 10001, 10002, 10003, 10004]
      if (webOSKeys.includes(keyCode)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    
    // Prevent default browser behavior for TV keys
    const tvKeyCodes = Object.values(TV_KEYS) as number[]
    if (tvKeyCodes.includes(keyCode)) {
      event.preventDefault()
      event.stopPropagation()
    }

    // Handle Back button navigation
    if (keyCode === TV_KEYS.BACK) {
      // Emit back navigation event
      const backEvent = new CustomEvent('tvBackPress', {
        detail: { originalEvent: event }
      })
      document.dispatchEvent(backEvent)
      return
    }

    // Dispatch custom event for app-level handling
    const customEvent = new CustomEvent('tvKeyPress', {
      detail: {
        keyCode,
        key: Object.keys(TV_KEYS).find(k => TV_KEYS[k as TVKey] === keyCode) as TVKey,
        originalEvent: event
      }
    })
    
    document.dispatchEvent(customEvent)
  }, [])

  useEffect(() => {
    // Initialize spatial navigation when component mounts
    initSpatialNavigation()
    
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [handleKeyDown])
}

// Hook to listen for specific TV key events
export function useTVKeyListener(
  keys: TVKey | TVKey[],
  handler: (key: TVKey, event: KeyboardEvent) => void,
  deps: React.DependencyList = []
) {
  const handleTVKey = useCallback((event: CustomEvent) => {
    const { key, originalEvent } = event.detail
    const targetKeys = Array.isArray(keys) ? keys : [keys]
    
    if (targetKeys.includes(key)) {
      handler(key, originalEvent)
    }
  }, [keys, handler, ...deps])

  useEffect(() => {
    document.addEventListener('tvKeyPress', handleTVKey as EventListener)
    return () => {
      document.removeEventListener('tvKeyPress', handleTVKey as EventListener)
    }
  }, [handleTVKey])
}

// Hook to listen for back button presses
export function useBackNavigation(handler: () => void, deps: React.DependencyList = []) {
  const handleBack = useCallback((event: CustomEvent) => {
    handler()
  }, [handler, ...deps])

  useEffect(() => {
    document.addEventListener('tvBackPress', handleBack as EventListener)
    return () => {
      document.removeEventListener('tvBackPress', handleBack as EventListener)
    }
  }, [handleBack])
}

// Focus context provider component with spatial navigation
interface FocusContextType {
  currentSection: string
  setCurrentSection: (section: string) => void
  addFocusable: (element: HTMLElement, sectionId?: string) => void
  removeFocusable: (element: HTMLElement) => void
  focusSection: (sectionId: string) => void
}

import React, { createContext, useContext, useState } from 'react'

const FocusContext = createContext<FocusContextType | null>(null)

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [currentSection, setCurrentSection] = useState<string>('main')
  
  const addFocusable = useCallback((element: HTMLElement, sectionId = 'main') => {
    element.setAttribute('data-focusable', 'true')
    element.setAttribute('data-section', sectionId)
    
    // Add spatial navigation attributes
    if (!element.getAttribute('data-nav-id')) {
      element.setAttribute('data-nav-id', `${sectionId}-${Date.now()}-${Math.random()}`)
    }
  }, [])

  const removeFocusable = useCallback((element: HTMLElement) => {
    element.removeAttribute('data-focusable')
    element.removeAttribute('data-section')
    element.removeAttribute('data-nav-id')
  }, [])

  const focusSection = useCallback((sectionId: string) => {
    setCurrentSection(sectionId)
    const firstElement = document.querySelector(`[data-section="${sectionId}"][data-focusable="true"]`) as HTMLElement
    if (firstElement) {
      const focusId = firstElement.getAttribute('data-nav-id')
      if (focusId) {
        setFocus(focusId)
      }
    }
  }, [])

  const value: FocusContextType = {
    currentSection,
    setCurrentSection,
    addFocusable,
    removeFocusable,
    focusSection
  }

  return (
    <FocusContext.Provider value={value}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocusContext() {
  const context = useContext(FocusContext)
  if (!context) {
    throw new Error('useFocusContext must be used within a FocusProvider')
  }
  return context
}

// Helper component for spatial navigation sections
interface FocusableSectionProps {
  sectionId: string
  children: React.ReactNode
  className?: string
  defaultFocus?: boolean
}

export function FocusableSection({ sectionId, children, className = '', defaultFocus = false }: FocusableSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { addFocusable, removeFocusable } = useFocusContext()

  useEffect(() => {
    if (ref.current) {
      addFocusable(ref.current, sectionId)
      
      if (defaultFocus) {
        setTimeout(() => {
          const focusId = ref.current?.getAttribute('data-nav-id')
          if (focusId) {
            setFocus(focusId)
          }
        }, 100)
      }
      
      return () => {
        if (ref.current) {
          removeFocusable(ref.current)
        }
      }
    }
  }, [sectionId, defaultFocus, addFocusable, removeFocusable])

  return (
    <div 
      ref={ref}
      data-section={sectionId}
      className={className}
    >
      {children}
    </div>
  )
}