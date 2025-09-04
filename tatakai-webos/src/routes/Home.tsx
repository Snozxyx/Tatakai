import React, { useState, useEffect } from 'react';
import AnimeCard from '../components/AnimeCard';
import SkeletonCard from '../components/SkeletonCard';

interface Anime {
  id: string;
  title: string;
  image: string;
  episodeCount?: number;
  year?: number;
  status?: string;
}

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
    // Simulate API calls
    const loadData = async () => {
      // Mock data for demonstration
      const mockAnimes: Anime[] = [
        {
          id: '1',
          title: 'Attack on Titan',
          image: '/api/placeholder/220/330',
          episodeCount: 87,
          year: 2013,
          status: 'completed'
        },
        {
          id: '2', 
          title: 'Demon Slayer',
          image: '/api/placeholder/220/330',
          episodeCount: 44,
          year: 2019,
          status: 'ongoing'
        },
        {
          id: '3',
          title: 'One Piece',
          image: '/api/placeholder/220/330',
          episodeCount: 1000,
          year: 1999,
          status: 'ongoing'
        },
        {
          id: '4',
          title: 'Naruto',
          image: '/api/placeholder/220/330',
          episodeCount: 720,
          year: 2002,
          status: 'completed'
        },
        {
          id: '5',
          title: 'My Hero Academia',
          image: '/api/placeholder/220/330',
          episodeCount: 154,
          year: 2016,
          status: 'ongoing'
        },
        {
          id: '6',
          title: 'Jujutsu Kaisen',
          image: '/api/placeholder/220/330',
          episodeCount: 24,
          year: 2020,
          status: 'ongoing'
        }
      ];

      setSpotlightAnime(mockAnimes[0]);

      // Simulate loading delays
      setTimeout(() => {
        setSections(prev => prev.map((section, index) => ({
          ...section,
          items: mockAnimes.slice(index * 3, (index * 3) + 6),
          loading: false
        })));
      }, 1500);
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
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
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
              ) : (
                // Show actual content
                section.items.map((anime) => (
                  <div key={anime.id} className="flex-shrink-0">
                    <AnimeCard
                      title={anime.title}
                      imgSrc={anime.image}
                      meta={`${anime.episodeCount} eps • ${anime.year}`}
                      onSelect={() => handleAnimeSelect(anime)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}