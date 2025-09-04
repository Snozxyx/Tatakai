'use client'

import { Home, Search, Tv, Heart, User, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SideNavigationProps {
  currentScreen?: string
  onNavigate?: (screen: string) => void
}

interface NavItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  screenId: string
  isActive?: boolean
  onSelect?: () => void
}

function NavItem({ icon: Icon, label, screenId, isActive, onSelect }: NavItemProps) {
  return (
    <button
      className={cn(
        "w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-200 focusable",
        "hover:bg-muted focus:bg-muted focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background",
        isActive && "bg-primary text-primary-foreground"
      )}
      onClick={onSelect}
      aria-label={label}
    >
      <Icon className={cn(
        "w-6 h-6",
        isActive ? "text-primary-foreground" : "text-muted-foreground"
      )} />
    </button>
  )
}

export function SideNavigation({ currentScreen = 'home', onNavigate }: SideNavigationProps) {
  const navItems = [
    { icon: Home, label: 'Home', screenId: 'home' },
    { icon: Search, label: 'Search', screenId: 'search' },
    { icon: Tv, label: 'Continue Watching', screenId: 'continue' },
    { icon: Heart, label: 'Favorites', screenId: 'favorites' },
    { icon: User, label: 'Profile', screenId: 'profile' },
    { icon: Settings, label: 'Settings', screenId: 'settings' },
  ]

  return (
    <nav className="fixed left-0 top-0 h-full w-16 bg-background border-r border-border flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <div className="mb-8 w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
        <span className="text-primary-foreground font-bold text-lg">T</span>
      </div>

      {/* Navigation Items */}
      <div className="flex flex-col gap-2">
        {navItems.map((item) => (
          <NavItem
            key={item.screenId}
            icon={item.icon}
            label={item.label}
            screenId={item.screenId}
            isActive={currentScreen === item.screenId}
            onSelect={() => onNavigate?.(item.screenId)}
          />
        ))}
      </div>
    </nav>
  )
}