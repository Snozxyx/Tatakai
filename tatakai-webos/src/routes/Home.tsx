import React, { useState, useEffect } from 'react';
import { PlayIcon } from '@heroicons/react/24/solid';
import AnimeCard from '../components/AnimeCard';
import SkeletonCard from '../components/SkeletonCard';
import { apiService, Anime } from '../lib/api';

interface AnimeSection {
  title: string;
  items: Anime[];
  loading: boolean;
}

export default function Home() {
  const [sections, setSections] = useState<AnimeSection[]>([
    { title: 'Continue Watching', items: [], loading: true },
    { title: 'Trending Now', items: [], loading: true },
    { title: 'Recently Added', items: [], loading: true },
    { title: 'Top Rated', items: [], loading: true },
  ]);

  const [spotlightAnime, setSpotlightAnime] = useState<Anime | null>(null);

  useEffect(() => {
    // Load real anime data from API sequentially to avoid rate limiting
    const loadData = async () => {
      try {
        // Load trending/top anime for spotlight first
        const topAnimeResponse = await apiService.getTopAnime(1);
        if (topAnimeResponse.data.length > 0) {
          setSpotlightAnime(topAnimeResponse.data[0]);
        }

        // Load sections one by one to avoid rate limiting
        try {
          const trendingData = await apiService.getTopAnime(1);
          setSections(prev => prev.map(section => 
            section.title === 'Trending Now' 
              ? { ...section, items: trendingData.data.slice(0, 6), loading: false }
              : section
          ));
        } catch (error) {
          console.error('Failed to load trending data:', error);
        }

        try {
          const seasonData = await apiService.getSeasonNow(1);
          setSections(prev => prev.map(section => 
            section.title === 'Continue Watching' 
              ? { ...section, items: seasonData.data.slice(0, 6), loading: false }
              : section
          ));
        } catch (error) {
          console.error('Failed to load season data:', error);
        }

        try {
          const recentData = await apiService.getRecentlyAdded(1);
          setSections(prev => prev.map(section => 
            section.title === 'Recently Added' 
              ? { ...section, items: recentData.data.slice(0, 6), loading: false }
              : section
          ));
        } catch (error) {
          console.error('Failed to load recent data:', error);
        }

        try {
          const topRatedData = await apiService.getTopAnime(2);
          setSections(prev => prev.map(section => 
            section.title === 'Top Rated' 
              ? { ...section, items: topRatedData.data.slice(0, 6), loading: false }
              : section
          ));
        } catch (error) {
          console.error('Failed to load top rated data:', error);
        }

      } catch (error) {
        console.error('Failed to load anime data:', error);
        // Set empty data on error
        setSections(prev => prev.map(section => ({
          ...section,
          items: [],
          loading: false
        })));
      }
    };

    loadData();
  }, []);

  const handleAnimeSelect = (anime: Anime) => {
    console.log('Selected anime:', anime);
    // Navigate to anime detail/player
  };

  return (
    <div className="min-h-screen bg-tvbg text-white">
      {/* Hero/Spotlight Section */}
      {spotlightAnime && (
        <div className="relative h-[60vh] overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${spotlightAnime.image})`,
              filter: 'blur(20px) brightness(0.3)'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          
          <div className="relative h-full flex items-center px-safeH">
            <div className="max-w-2xl space-y-6">
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                {spotlightAnime.title}
              </h1>
              <div className="flex items-center space-x-4 text-lg text-gray-300">
                <span>{spotlightAnime.year}</span>
                <span>•</span>
                <span>{spotlightAnime.episodeCount} Episodes</span>
                <span>•</span>
                <span className="capitalize">{spotlightAnime.status}</span>
              </div>
              <div className="flex items-center space-x-4">
                <button 
                  className="focusable px-8 py-4 bg-tatakai-purple hover:bg-purple-700 text-white font-semibold rounded-lg flex items-center space-x-3"
                  onClick={() => handleAnimeSelect(spotlightAnime)}
                >
                  <PlayIcon className="w-6 h-6" />
                  <span>Watch Now</span>
                </button>
                <button className="focusable px-8 py-4 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-lg">
                  More Info
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Sections */}
      <div className="py-8 space-y-12">
        {sections.map((section, _sectionIndex) => (
          <div key={section.title} className="px-safeH">
            <h2 className="text-2xl font-bold mb-6 text-white">{section.title}</h2>
            
            <div className="flex space-x-4 overflow-x-auto overflow-y-hidden pb-4">
              {section.loading ? (
                // Show skeleton loaders
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex-shrink-0">
                    <SkeletonCard />
                  </div>
                ))
              ) : section.items.length > 0 ? (
                // Show actual content
                section.items.map((anime) => (
                  <div key={anime.id} className="flex-shrink-0">
                    <AnimeCard
                      title={anime.title}
                      imgSrc={anime.image}
                      meta={`${anime.episodeCount || 'Unknown'} eps • ${anime.year || 'Unknown'}`}
                      onSelect={() => handleAnimeSelect(anime)}
                    />
                  </div>
                ))
              ) : (
                // Show empty state
                <div className="text-gray-400 text-lg py-8">
                  No content available. Check your connection and try again.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}