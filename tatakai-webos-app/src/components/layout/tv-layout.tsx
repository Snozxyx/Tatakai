'use client'

import { useState, useEffect } from 'react'
import { SideNavigation } from './side-navigation'
import { cn } from '@/lib/utils'

interface TVLayoutProps {
  children: React.ReactNode
}

export function TVLayout({ children }: TVLayoutProps) {
  const [currentScreen, setCurrentScreen] = useState('home')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  const handleNavigate = (screen: string) => {
    setCurrentScreen(screen)
    // Handle navigation logic here
    console.log(`Navigating to: ${screen}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mb-4 mx-auto">
            <span className="text-primary-foreground font-bold text-2xl">T</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Tatakai</h1>
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SideNavigation 
        currentScreen={currentScreen} 
        onNavigate={handleNavigate}
      />
      
      <main className={cn(
        "ml-16 min-h-screen",
        "container-tv py-8"
      )}>
        {children}
      </main>
      
      {/* Global loading overlay */}
      <div id="loading-overlay" className="hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    </div>
  )
}