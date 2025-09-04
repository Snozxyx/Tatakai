'use client'

import { Search, Settings, User } from 'lucide-react'
import { useTVKeyListener } from '../../lib/focus-management'
import { useState } from 'react'
import { SearchPage } from '../search/search-page'

export function Header() {
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  // Handle color key shortcuts
  useTVKeyListener(['RED', 'GREEN', 'YELLOW', 'BLUE'], (key) => {
    switch (key) {
      case 'RED':
        // Search shortcut
        setShowSearch(true)
        break
      case 'GREEN':
        // Profile shortcut
        console.log('Profile activated')
        break
      case 'YELLOW':
        // Settings shortcut
        console.log('Settings activated')
        break
      case 'BLUE':
        // Help shortcut
        console.log('Help activated')
        break
    }
  })

  const handleSearchClick = () => {
    setShowSearch(true)
  }

  const handleCloseSearch = () => {
    setShowSearch(false)
  }

  if (showSearch) {
    return <SearchPage onClose={handleCloseSearch} />
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/20">
      <div className="tv-safe flex items-center justify-between h-20">
        {/* Logo */}
        <div className="flex items-center space-x-8">
          <h1 className="text-3xl font-bold text-accent">Tatakai</h1>
          
          {/* Navigation Menu */}
          <nav className="hidden lg:flex items-center space-x-6">
            <button 
              className="nav-item focusable"
              onFocus={() => setActiveItem('home')}
            >
              Home
            </button>
            <button 
              className="nav-item focusable"
              onFocus={() => setActiveItem('trending')}
            >
              Trending
            </button>
            <button 
              className="nav-item focusable"
              onFocus={() => setActiveItem('movies')}
            >
              Movies
            </button>
            <button 
              className="nav-item focusable"
              onFocus={() => setActiveItem('series')}
            >
              TV Series
            </button>
            <button 
              className="nav-item focusable"
              onFocus={() => setActiveItem('genres')}
            >
              Genres
            </button>
          </nav>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-4">
          {/* Search Button */}
          <button 
            className="nav-item focusable flex items-center space-x-2"
            onFocus={() => setActiveItem('search')}
            onClick={handleSearchClick}
            aria-label="Search (Red Button)"
          >
            <Search size={24} />
            <span className="hidden xl:inline">Search</span>
          </button>

          {/* Profile Button */}
          <button 
            className="nav-item focusable flex items-center space-x-2"
            onFocus={() => setActiveItem('profile')}
            aria-label="Profile (Green Button)"
          >
            <User size={24} />
            <span className="hidden xl:inline">Profile</span>
          </button>

          {/* Settings Button */}
          <button 
            className="nav-item focusable flex items-center space-x-2"
            onFocus={() => setActiveItem('settings')}
            aria-label="Settings (Yellow Button)"
          >
            <Settings size={24} />
            <span className="hidden xl:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Color Key Hints */}
      <div className="absolute bottom-0 right-4 transform translate-y-full">
        <div className="bg-black/80 rounded-lg p-2 text-xs space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Search</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Profile</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>Settings</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Help</span>
          </div>
        </div>
      </div>
    </header>
  )
}