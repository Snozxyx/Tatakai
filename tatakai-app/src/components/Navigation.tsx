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
  Sun
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AnimeAPI, type Anime } from '@/lib/api';

const Navigation = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Anime[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const router = useRouter();

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
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
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

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled 
            ? 'bg-background/95 backdrop-blur-md border-b border-border' 
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center space-x-2"
            >
              <Link href="/" className="flex items-center space-x-2">
                <Image
                  src="/logo.png"
                  alt="Tatakai"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-lg"
                />
                <span className="text-xl font-bold text-foreground">Tatakai</span>
              </Link>
            </motion.div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-6">
              {navigationItems.map((item) => (
                <motion.div
                  key={item.name}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                >
                  <Link
                    href={item.href}
                    className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.name}</span>
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
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSearchOpen(true)}
                  className="hidden sm:flex"
                >
                  <Search className="w-4 h-4" />
                  <span className="ml-2">Search</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSearchOpen(true)}
                  className="sm:hidden"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </motion.div>

              {/* Theme Toggle */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleTheme}
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </motion.div>

              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="md:hidden">
                    <Menu className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80">
                  <div className="flex flex-col space-y-4 mt-8">
                    {mobileMenuItems.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors"
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.name}</span>
                      </Link>
                    ))}
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
              className="max-w-2xl mx-auto mt-20 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-card border border-border rounded-lg shadow-lg p-4">
                <div className="flex items-center space-x-3 mb-4">
                  <Search className="w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Search for anime..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                    className="border-none focus:ring-0"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSearchOpen(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Search Suggestions */}
                {searchSuggestions.length > 0 && (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {searchSuggestions.map((suggestion: Anime, index: number) => (
                      <motion.div
                        key={suggestion.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => router.push(`/anime/${suggestion.id}`)}
                      >
                        <Image
                          src={suggestion.poster}
                          alt={suggestion.name}
                          width={48}
                          height={64}
                          className="w-12 h-16 object-cover rounded"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">{suggestion.name}</h4>
                          {suggestion.jname && (
                            <p className="text-xs text-muted-foreground">{suggestion.jname}</p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {searchQuery.length > 2 && searchSuggestions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No suggestions found</p>
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
