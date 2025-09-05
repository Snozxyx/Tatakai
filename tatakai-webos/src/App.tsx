import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HomeIcon, 
  FireIcon, 
  FilmIcon, 
  TvIcon, 
  HeartIcon, 
  MagnifyingGlassIcon 
} from '@heroicons/react/24/outline';
import TVHeader from './components/TVHeader';
import OverlaySidebar from './components/OverlaySidebar';
import Home from './routes/Home';
import Player from './routes/Player';
import Settings from './routes/Settings';
import { useUIStore } from './stores/uiStore';
import { setupSpatial } from './lib/spatial';
import './index.css';
import './styles/tv-utils.css';

const navigationItems = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'trending', label: 'Trending', icon: FireIcon },
  { id: 'movies', label: 'Movies', icon: FilmIcon },
  { id: 'series', label: 'TV Series', icon: TvIcon },
  { id: 'favorites', label: 'My List', icon: HeartIcon },
  { id: 'search', label: 'Search', icon: MagnifyingGlassIcon },
];

function App() {
  const { 
    currentRoute, 
    sidebarOpen, 
    theme, 
    uiScale, 
    reducedMotion,
    setCurrentRoute, 
    setSidebarOpen 
  } = useUIStore();

  useEffect(() => {
    // Initialize spatial navigation
    setupSpatial();

    // Apply theme settings to document
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--ui-scale', uiScale.toString());
    
    if (reducedMotion) {
      document.documentElement.style.setProperty('--animation-duration', '0s');
    } else {
      document.documentElement.style.removeProperty('--animation-duration');
    }

    console.log('Tatakai webOS app initialized');
  }, [theme, uiScale, reducedMotion]);

  const handleNavigation = (routeId: string) => {
    setCurrentRoute(routeId);
    setSidebarOpen(false);
  };

  const renderCurrentRoute = () => {
    switch (currentRoute) {
      case 'home':
      case 'trending':
      case 'movies':
      case 'series':
      case 'favorites':
      case 'search':
        return <Home />;
      case 'player':
        return <Player />;
      case 'settings':
        return <Settings />;
      default:
        return <Home />;
    }
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -20 }
  };

  const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: reducedMotion ? 0 : 0.5
  };

  return (
    <div className="min-h-screen bg-tvbg text-white overflow-x-hidden">
      {/* Header */}
      {currentRoute !== 'player' && (
        <TVHeader onOpenNav={() => setSidebarOpen(true)} />
      )}

      {/* Sidebar */}
      <OverlaySidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={navigationItems}
        onSelect={handleNavigation}
      />

      {/* Main Content */}
      <main className={currentRoute === 'player' ? '' : 'pt-0'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentRoute}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            {renderCurrentRoute()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global keyboard shortcuts */}
      <div className="sr-only">
        <p>Use arrow keys to navigate, Enter to select, and Escape to go back</p>
      </div>
    </div>
  );
}

export default App;