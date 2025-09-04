'use client'

import { useEffect, useRef, useCallback } from 'react'

// Simplified focus management hook for TV navigation
export function useFocusManagement() {
  const isInitialized = useRef(false)

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true
    }
  }, [])

  const setInitialFocus = useCallback((selector?: string) => {
    setTimeout(() => {
      const focusSelector = selector || '.focusable'
      const element = document.querySelector(focusSelector) as HTMLElement
      if (element) {
        element.focus()
      }
    }, 100)
  }, [])

  const focusElement = useCallback((selector: string) => {
    const element = document.querySelector(selector) as HTMLElement
    if (element) {
      element.focus()
    }
  }, [])

  return {
    setInitialFocus,
    focusElement,
    isInitialized: isInitialized.current
  }
}

// TV Remote key mapping
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
  
  // Media keys
  PLAY_PAUSE: 415,
  PLAY: 19,
  PAUSE: 19,
  STOP: 413,
  REWIND: 412,
  FAST_FORWARD: 417,
  
  // Color keys (LG webOS)
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
  NUM_9: 57
} as const

export type TVKey = keyof typeof TV_KEYS

// Custom hook for handling TV remote keys
export function useRemoteKeyHandler() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const keyCode = event.keyCode || event.which
    
    // Prevent default browser behavior for TV keys
    const tvKeyCodes = Object.values(TV_KEYS) as number[]
    if (tvKeyCodes.includes(keyCode)) {
      event.preventDefault()
      event.stopPropagation()
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
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
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

// Focus context provider component
interface FocusContextType {
  currentFocusedElement: HTMLElement | null
  setCurrentFocus: (element: HTMLElement | null) => void
  focusNext: () => void
  focusPrev: () => void
  focusUp: () => void
  focusDown: () => void
}

import React, { createContext, useContext, useState } from 'react'

const FocusContext = createContext<FocusContextType | null>(null)

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [currentFocusedElement, setCurrentFocusedElement] = useState<HTMLElement | null>(null)
  
  const setCurrentFocus = useCallback((element: HTMLElement | null) => {
    setCurrentFocusedElement(element)
  }, [])

  const focusNext = useCallback(() => {
    // Implementation will be handled by spatial navigation
    const event = new KeyboardEvent('keydown', { keyCode: TV_KEYS.RIGHT })
    document.dispatchEvent(event)
  }, [])

  const focusPrev = useCallback(() => {
    const event = new KeyboardEvent('keydown', { keyCode: TV_KEYS.LEFT })
    document.dispatchEvent(event)
  }, [])

  const focusUp = useCallback(() => {
    const event = new KeyboardEvent('keydown', { keyCode: TV_KEYS.UP })
    document.dispatchEvent(event)
  }, [])

  const focusDown = useCallback(() => {
    const event = new KeyboardEvent('keydown', { keyCode: TV_KEYS.DOWN })
    document.dispatchEvent(event)
  }, [])

  const value: FocusContextType = {
    currentFocusedElement,
    setCurrentFocus,
    focusNext,
    focusPrev,
    focusUp,
    focusDown
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