'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Menu, 
  X, 
  Home, 
  Tv, 
  Film, 
  Star, 
  Clock, 
  TrendingUp,
  User,
  Settings,
  Moon,
  Sun,
  Monitor
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AnimeAPI, type Anime } from '@/lib/api';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useDevice } from '@/contexts/DeviceContext';

const Navigation = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Anime[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { deviceType, showDeviceSelector } = useDevice();

  // Desktop navigation keyboard navigation
  const desktopNav = useKeyboardNavigation({
    isActive: !isSearchOpen && !isMobileMenuOpen,
    selector: '[data-keyboard-nav="desktop"]',
    autoFocus: false,
    onSelect: (element) => {
      // Handle navigation or button clicks
      const link = element.querySelector('a');
      const button = element.querySelector('button');
      if (link) {
        link.click();
      } else if (button) {
        button.click();
      } else {
        element.click();
      }
    }
  });

  // Search modal keyboard navigation
  const searchNav = useKeyboardNavigation({
    isActive: isSearchOpen,
    selector: '[data-keyboard-nav="search"]',
    autoFocus: true,
    onSelect: (element) => {
      const suggestionId = element.getAttribute('data-anime-id');
      if (suggestionId) {
        router.push(`/anime/${suggestionId}`);
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    }
  });

  // Mobile menu keyboard navigation
  const mobileNav = useKeyboardNavigation({
    isActive: isMobileMenuOpen,
    selector: '[data-keyboard-nav="mobile"]',
    autoFocus: true,
    onSelect: (element) => {
      const link = element.querySelector('a');
      const button = element.querySelector('button');
      if (link) {
        link.click();
      } else if (button) {
        button.click();
      } else {
        element.click();
      }
      setIsMobileMenuOpen(false);
    }
  });

  // Update focusable elements when search suggestions change
  useEffect(() => {
    if (isSearchOpen) {
      searchNav.updateFocusableElements();
    }
  }, [searchSuggestions, searchNav]);

  // Update focusable elements when mobile menu state changes
  useEffect(() => {
    if (isMobileMenuOpen) {
      mobileNav.updateFocusableElements();
    }
  }, [isMobileMenuOpen, mobileNav]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const debounce = setTimeout(async () => {
        try {
          const suggestions = await AnimeAPI.searchAnime(searchQuery, 1);
          setSearchSuggestions(suggestions.data?.animes?.slice(0, 5) || []);
        } catch (error) {
          console.error('Error fetching suggestions:', error);
        }
      }, 300);

      return () => clearTimeout(debounce);
    } else {
      setSearchSuggestions([]);
    }
  }, [searchQuery]);

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    
    // Add smooth transition for theme change
    document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    document.documentElement.classList.toggle('dark');
    
    // Remove transition after animation completes
    setTimeout(() => {
      document.documentElement.style.transition = '';
    }, 300);
  };

    const navigationItems = [
    { name: 'Browse', href: '/category/all', icon: Home },
    { name: 'Movies', href: '/movies', icon: Film },
    { name: 'TV Series', href: '/tv-series', icon: Tv },
    { name: 'Top Rated', href: '/category/most-favorite', icon: Star },
    { name: 'Recently Added', href: '/category/recently-added', icon: Clock },
    { name: 'Trending', href: '/trending', icon: TrendingUp },
  ];

  const mobileMenuItems = [
    ...navigationItems,
    { name: 'Profile', href: '/profile', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const deviceMenuItems = [
    { 
      name: 'Device Settings', 
      action: showDeviceSelector, 
      icon: Monitor,
      description: `Current: ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}`
    },
  ];

  return (
    <>
      <motion.nav
        ref={desktopNav.containerRef}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 device-nav ${
          isScrolled 
            ? 'bg-background/95 backdrop-blur-md border-b border-border' 
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between device-nav">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center space-x-2"
            >
              <Link href="/" className="flex items-center space-x-2 device-scaled-lg">
                <Image
                  src="/logo.png"
                  alt="Tatakai"
                  width={32}
                  height={32}
                  className={`rounded-lg ${
                    deviceType === 'tv' ? 'w-10 h-10' : 'w-8 h-8'
                  }`}
                />
                <span className="text-xl font-bold text-foreground device-scaled-xl">Tatakai</span>
              </Link>
            </motion.div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              {navigationItems.map((item) => (
                <motion.div
                  key={item.name}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  data-keyboard-nav="desktop"
                  tabIndex={-1}
                >
                  <Link
                    href={item.href}
                    className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-colors device-scaled device-touch-target p-2 rounded-lg"
                  >
                    <item.icon className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-4 h-4'}`} />
                    <span className="device-scaled">{item.name}</span>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Search and Actions */}
            <div className="flex items-center space-x-3">
              {/* Search */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                data-keyboard-nav="desktop"
                tabIndex={-1}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSearchOpen(true)}
                  className="hidden sm:flex device-touch-target px-3 device-scaled"
                >
                  <Search className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-4 h-4'}`} />
                  <span className="ml-2 device-scaled">Search</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSearchOpen(true)}
                  className="sm:hidden device-touch-target p-2"
                >
                  <Search className={`${deviceType === 'tv' ? 'w-7 h-7' : 'w-5 h-5'}`} />
                </Button>
              </motion.div>

              {/* Theme Toggle */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                data-keyboard-nav="desktop"
                tabIndex={-1}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                  className="device-touch-target p-2"
                >
                  {isDarkMode ? 
                    <Sun className={`${deviceType === 'tv' ? 'w-7 h-7' : 'w-5 h-5'}`} /> : 
                    <Moon className={`${deviceType === 'tv' ? 'w-7 h-7' : 'w-5 h-5'}`} />
                  }
                </Button>
              </motion.div>

              {/* Mobile Menu */}
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="md:hidden device-touch-target p-2"
                  >
                    <Menu className={`${deviceType === 'tv' ? 'w-7 h-7' : 'w-5 h-5'}`} />
                  </Button>
                </SheetTrigger>
                <SheetContent 
                  side="right" 
                  className="w-[85vw] xs:w-80 sm:w-80 max-w-sm bg-background border-border"
                >
                  <div ref={mobileNav.containerRef} className="flex flex-col space-y-1 mt-8 px-2">
                    {mobileMenuItems.map((item) => (
                      <div
                        key={item.name}
                        data-keyboard-nav="mobile"
                        tabIndex={-1}
                      >
                        <Link
                          href={item.href}
                          className="flex items-center space-x-3 device-touch-target px-4 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 active:bg-accent/80 device-scaled"
                        >
                          <item.icon className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'} text-muted-foreground`} />
                          <span className="font-medium device-scaled">{item.name}</span>
                        </Link>
                      </div>
                    ))}
                    
                    {/* Device Settings */}
                    <div className="pt-2 mt-2 border-t border-border">
                      {deviceMenuItems.map((item) => (
                        <div
                          key={item.name}
                          data-keyboard-nav="mobile"
                          tabIndex={-1}
                        >
                          <button
                            onClick={item.action}
                            className="flex items-center justify-between w-full device-touch-target px-4 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 active:bg-accent/80 device-scaled"
                          >
                            <div className="flex items-center space-x-3">
                              <item.icon className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'} text-muted-foreground`} />
                              <span className="font-medium device-scaled">{item.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground device-scaled">
                              {item.description}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Mobile Theme Toggle */}
                    <div className="pt-2 mt-2 border-t border-border">
                      <div
                        data-keyboard-nav="mobile"
                        tabIndex={-1}
                      >
                        <button
                          onClick={toggleTheme}
                          className="flex items-center space-x-3 device-touch-target px-4 py-3 rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200 active:bg-accent/80 w-full device-scaled"
                        >
                          {isDarkMode ? (
                            <Sun className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'} text-muted-foreground`} />
                          ) : (
                            <Moon className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'} text-muted-foreground`} />
                          )}
                          <span className="font-medium device-scaled">
                            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto mt-16 sm:mt-20 p-4 sm:p-6 max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-card border border-border rounded-lg shadow-lg p-4 sm:p-6 device-scaled">
                <div className="flex items-center space-x-3 mb-4">
                  <Search className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'} text-muted-foreground`} />
                  <Input
                    placeholder="Search for anime..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                    className="border-none focus:ring-0 device-scaled"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSearchOpen(false)}
                    className="device-touch-target p-2"
                  >
                    <X className={`${deviceType === 'tv' ? 'w-6 h-6' : 'w-5 h-5'}`} />
                  </Button>
                </div>

                {/* Search Suggestions */}
                {searchSuggestions.length > 0 && (
                  <div ref={searchNav.containerRef} className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                    {searchSuggestions.map((suggestion: Anime, index: number) => (
                      <motion.div
                        key={suggestion.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="search-suggestion flex items-center space-x-3 device-touch-target p-3 rounded-lg hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors duration-200 active:bg-accent/80 device-scaled"
                        data-keyboard-nav="search"
                        data-anime-id={suggestion.id}
                        tabIndex={-1}
                        onClick={() => router.push(`/anime/${suggestion.id}`)}
                      >
                        <Image
                          src={suggestion.poster}
                          alt={suggestion.name}
                          width={48}
                          height={64}
                          className={`object-cover rounded ${
                            deviceType === 'tv' ? 'w-16 h-20' : 'w-12 h-16'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate device-scaled">{suggestion.name}</h4>
                          {suggestion.jname && (
                            <p className="text-xs text-muted-foreground truncate device-scaled">{suggestion.jname}</p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {searchQuery.length > 2 && searchSuggestions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground device-scaled">
                    <Search className={`${deviceType === 'tv' ? 'w-10 h-10' : 'w-8 h-8'} mx-auto mb-2 opacity-50`} />
                    <p className="device-scaled">No suggestions found</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navigation;
