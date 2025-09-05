import React, { useState, useEffect } from 'react';
import { Button, Chip, Divider, Spacer } from '@heroui/react';
import { PlayIcon, InformationCircleIcon, StarIcon } from '@heroicons/react/24/solid';
import AnimeCard from '../components/AnimeCard';
import SkeletonCard from '../components/SkeletonCard';
import { apiService, Anime, HomeData } from '../lib/api';

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
    { title: 'Most Popular', items: [], loading: true },
  ]);

  const [spotlightAnime, setSpotlightAnime] = useState<Anime | null>(null);

  useEffect(() => {
    // Load real anime data from HiAnime API
    const loadData = async () => {
      try {
        console.log('Loading home data from HiAnime API...');
        const homeData: HomeData = await apiService.getHomeData();
        
        // Set spotlight anime from the first spotlight anime
        if (homeData.spotlightAnimes && homeData.spotlightAnimes.length > 0) {
          setSpotlightAnime(homeData.spotlightAnimes[0]);
        }

        // Update sections with real data
        setSections([
          { 
            title: 'Continue Watching', 
            items: homeData.latestEpisodeAnimes?.slice(0, 6) || [], 
            loading: false 
          },
          { 
            title: 'Trending Now', 
            items: homeData.trendingAnimes?.slice(0, 6) || [], 
            loading: false 
          },
          { 
            title: 'Recently Added', 
            items: homeData.latestCompletedAnimes?.slice(0, 6) || [], 
            loading: false 
          },
          { 
            title: 'Most Popular', 
            items: homeData.mostPopularAnimes?.slice(0, 6) || [], 
            loading: false 
          },
        ]);

        console.log('Home data loaded successfully:', homeData);
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/95">
      {/* Hero/Spotlight Section */}
      {spotlightAnime && (
        <section className="relative h-[70vh] overflow-hidden">
          {/* Background image with blur effect */}
          <div 
            className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110"
            style={{ 
              backgroundImage: `url(${spotlightAnime.image})`,
            }}
          />
          
          {/* Dark overlay with gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          
          {/* Hero content */}
          <div className="relative h-full flex items-center max-w-4xl mx-auto px-safeH">
            <div className="space-y-6 text-white max-w-2xl">
              <div className="space-y-2">
                <Chip 
                  color="primary" 
                  variant="flat" 
                  size="lg"
                  className="bg-primary/20 text-primary-300 font-semibold"
                >
                  Featured Anime
                </Chip>
                <h1 className="text-5xl md:text-7xl font-bold leading-tight bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
                  {spotlightAnime.title}
                </h1>
              </div>
              
              <div className="flex items-center gap-4 text-lg">
                {spotlightAnime.type && (
                  <Chip color="secondary" variant="flat" size="lg" className="font-medium">
                    {spotlightAnime.type}
                  </Chip>
                )}
                {spotlightAnime.episodeCount && (
                  <span className="text-white/90 font-medium">
                    {spotlightAnime.episodeCount.sub || spotlightAnime.episodeCount.dub || 'Unknown'} Episodes
                  </span>
                )}
                {spotlightAnime.rating && (
                  <div className="flex items-center gap-1 text-yellow-400">
                    <StarIcon className="w-5 h-5" />
                    <span className="font-semibold">{spotlightAnime.rating}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <Button 
                  color="primary"
                  size="lg"
                  radius="lg"
                  variant="shadow"
                  startContent={<PlayIcon className="w-6 h-6" />}
                  onPress={() => handleAnimeSelect(spotlightAnime)}
                  className="focusable font-semibold text-lg px-8 py-6"
                >
                  Watch Now
                </Button>
                <Button 
                  variant="flat"
                  color="default"
                  size="lg"
                  radius="lg"
                  startContent={<InformationCircleIcon className="w-6 h-6" />}
                  className="focusable bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white font-semibold px-8 py-6"
                >
                  More Info
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <Spacer y={8} />

      {/* Content Sections */}
      <div className="space-y-12 px-safeH pb-20">
        {sections.map((section, sectionIndex) => (
          <section key={section.title} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-white">
                {section.title}
              </h2>
              <Button 
                variant="light" 
                color="primary"
                className="text-primary-400 hover:text-primary-300 font-medium"
              >
                View All
              </Button>
            </div>
            
            <div className="flex gap-6 overflow-x-auto overflow-y-hidden pb-4 scrollbar-hide">
              {section.loading ? (
                // Show skeleton loaders
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={`skeleton-${sectionIndex}-${index}`} className="flex-shrink-0">
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
                      meta={`${anime.episodeCount?.sub || anime.episodeCount?.dub || 'Unknown'} eps${anime.type ? ` • ${anime.type}` : ''}`}
                      onSelect={() => handleAnimeSelect(anime)}
                    />
                  </div>
                ))
              ) : (
                // Show empty state
                <div className="text-white/60 text-lg py-8 text-center w-full">
                  <p>No content available. Check your connection and try again.</p>
                </div>
              )}
            </div>
            
            {sectionIndex < sections.length - 1 && (
              <Divider className="bg-white/10" />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}