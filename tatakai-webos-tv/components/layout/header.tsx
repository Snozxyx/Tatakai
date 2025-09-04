'use client'

import { Menu, Search, Settings, User, Home, TrendingUp, Film, Tv, Gamepad2, X } from 'lucide-react'
import { useTVKeyListener } from '../../lib/focus-management'
import { useState, useEffect } from 'react'
import { SearchPage } from '../search/search-page'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  activeItem: string | null
  setActiveItem: (item: string | null) => void
}

function Sidebar({ isOpen, onClose, activeItem, setActiveItem }: SidebarProps) {
  // Handle back button to close sidebar
  useTVKeyListener(['BACK'], () => {
    if (isOpen) {
      onClose()
    }
  })

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-80 bg-background-light/95 backdrop-blur-md z-50 border-r border-border-light animate-slide-in-left">
        <div className="p-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-tv-2xl font-bold text-accent">Tatakai</h2>
            <button 
              className="focusable p-2 rounded-lg"
              onClick={onClose}
              aria-label="Close Menu"
            >
              <X size={32} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-4">
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'home' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('home')}
            >
              <Home size={28} />
              <span className="text-tv-base">Home</span>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'trending' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('trending')}
            >
              <TrendingUp size={28} />
              <span className="text-tv-base">Trending</span>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'movies' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('movies')}
            >
              <Film size={28} />
              <span className="text-tv-base">Movies</span>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'series' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('series')}
            >
              <Tv size={28} />
              <span className="text-tv-base">TV Series</span>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'genres' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('genres')}
            >
              <Gamepad2 size={28} />
              <span className="text-tv-base">Genres</span>
            </button>
          </nav>

          {/* Divider */}
          <div className="border-t border-border-light"></div>

          {/* Actions */}
          <div className="space-y-4">
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'search' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('search')}
              aria-label="Search (Red Button)"
            >
              <Search size={28} />
              <span className="text-tv-base">Search</span>
              <div className="ml-auto w-4 h-4 bg-red-500 rounded"></div>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'profile' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('profile')}
              aria-label="Profile (Green Button)"
            >
              <User size={28} />
              <span className="text-tv-base">Profile</span>
              <div className="ml-auto w-4 h-4 bg-green-500 rounded"></div>
            </button>
            
            <button 
              className={`nav-item w-full text-left flex items-center space-x-4 ${
                activeItem === 'settings' ? 'active' : ''
              }`}
              onFocus={() => setActiveItem('settings')}
              aria-label="Settings (Yellow Button)"
            >
              <Settings size={28} />
              <span className="text-tv-base">Settings</span>
              <div className="ml-auto w-4 h-4 bg-yellow-500 rounded"></div>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function Header() {
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

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
    setShowSidebar(false)
  }

  const handleCloseSearch = () => {
    setShowSearch(false)
  }

  const handleMenuClick = () => {
    setShowSidebar(true)
  }

  const handleCloseSidebar = () => {
    setShowSidebar(false)
  }

  if (showSearch) {
    return <SearchPage onClose={handleCloseSearch} />
  }

  return (
    <>
      {/* Simplified Header - Content First */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-background/80 backdrop-blur-md">
        <div className="tv-safe-x flex items-center justify-between h-24">
          {/* Logo and Menu */}
          <div className="flex items-center space-x-6">
            <button 
              className="focusable p-3 rounded-lg flex items-center space-x-4"
              onClick={handleMenuClick}
              aria-label="Open Menu"
            >
              <Menu size={32} />
              <span className="text-tv-xl font-bold text-accent">Tatakai</span>
            </button>
          </div>

          {/* Quick Access */}
          <div className="flex items-center space-x-4">
            {/* Search Button */}
            <button 
              className="focusable p-3 rounded-lg"
              onClick={handleSearchClick}
              aria-label="Search (Red Button)"
            >
              <Search size={32} />
            </button>
          </div>
        </div>
      </header>

      {/* Overlay Sidebar */}
      <Sidebar 
        isOpen={showSidebar}
        onClose={handleCloseSidebar}
        activeItem={activeItem}
        setActiveItem={setActiveItem}
      />
    </>
  )
}