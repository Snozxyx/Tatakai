import React, { useState } from 'react';
import { 
  Home, 
  Search, 
  TrendingUp, 
  Film, 
  Tv, 
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';
import Focusable from './Focusable';
import { cn } from '@/lib/utils';

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path: string;
}

interface TVNavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  className?: string;
}

const navigationItems: NavigationItem[] = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'search', label: 'Search', icon: Search, path: '/search' },
  { id: 'trending', label: 'Trending', icon: TrendingUp, path: '/trending' },
  { id: 'movies', label: 'Movies', icon: Film, path: '/movies' },
  { id: 'series', label: 'TV Series', icon: Tv, path: '/series' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

const TVNavigation: React.FC<TVNavigationProps> = ({ 
  currentPath, 
  onNavigate, 
  className 
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Create navigation container for spatial navigation
  const { ref: navRef, focusKey: navFocusKey, focusSelf } = useFocusable({
    focusKey: 'NAV_CONTAINER',
    trackChildren: true
  });

  // Set initial focus to navigation when it mounts
  React.useEffect(() => {
    // Small delay to ensure the children are rendered
    setTimeout(() => {
      focusSelf();
    }, 100);
  }, [focusSelf]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <FocusContext.Provider value={navFocusKey}>
      <nav ref={navRef} className={cn('tv-navbar', isCollapsed && 'collapsed', className)}>
        {/* Header */}
        <div className="tv-navbar__header">
          <div className="tv-navbar__logo">
            <img 
              src="/logo.png" 
              alt="Tatakai" 
              className="tv-navbar__logo-image"
            />
            <span className="tv-navbar__logo-text">Tatakai</span>
          </div>
          
          <Focusable
            id="nav-toggle"
            onEnter={toggleCollapse}
            className="tv-navbar__toggle"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </Focusable>
        </div>

        {/* Navigation Content */}
        <div className="tv-navbar__content">
          <ul className="tv-navbar__menu">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path || 
                (item.path !== '/' && currentPath.startsWith(item.path));

              return (
                <li key={item.id} className="tv-navbar__item">
                  <Focusable
                    id={`nav-${item.id}`}
                    onEnter={() => onNavigate(item.path)}
                    className={cn(
                      'tv-navbar__link',
                      isActive && 'active'
                    )}
                  >
                    <Icon className="tv-navbar__icon" />
                    <span className="tv-navbar__text">{item.label}</span>
                    {isActive && <div className="tv-navbar__indicator" />}
                  </Focusable>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="tv-navbar__footer">
          <div className="tv-navbar__version text-center text-tv-xs text-zinc-500">
            Tatakai v1.0.0
          </div>
        </div>
      </nav>
    </FocusContext.Provider>
  );
};

export default TVNavigation;