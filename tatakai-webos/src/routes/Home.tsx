import React, { useState, useEffect } from 'react';
import { Button, Chip } from '@heroui/react';
import { PlayIcon, InformationCircleIcon } from '@heroicons/react/24/solid';
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

  const heroStyle = {
    position: 'relative' as const,
    height: '60vh',
    overflow: 'hidden'
  };

  const heroBackgroundStyle = {
    position: 'absolute' as const,
    inset: '0',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(20px) brightness(0.3)'
  };

  const heroOverlayStyle = {
    position: 'absolute' as const,
    inset: '0',
    background: 'linear-gradient(to right, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.4), transparent)'
  };

  const heroContentStyle = {
    position: 'relative' as const,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    maxWidth: '32rem',
    gap: '1.5rem',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    textAlign: 'left' as const
  };

  const sectionStyle = {
    padding: '2rem 0',
    gap: '3rem',
    display: 'flex',
    flexDirection: 'column' as const
  };

  const sectionContentStyle = {
    display: 'flex',
    gap: '1rem',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: '1rem'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111111', color: '#ffffff' }}>
      {/* Hero/Spotlight Section */}
      {spotlightAnime && (
        <div style={heroStyle}>
          <div 
            style={{ 
              ...heroBackgroundStyle,
              backgroundImage: `url(${spotlightAnime.image})`
            }}
          />
          <div style={heroOverlayStyle} />
          
          <div style={{ ...heroContentStyle }} className="px-safeH">
            <h1 style={{
              fontSize: 'clamp(2rem, 5vw, 4rem)',
              fontWeight: 'bold',
              lineHeight: '1.1',
              marginBottom: '1rem'
            }}>
              {spotlightAnime.title}
            </h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontSize: '1.125rem',
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: '1.5rem',
              flexWrap: 'wrap'
            }}>
              {spotlightAnime.type && <Chip color="secondary" variant="flat">{spotlightAnime.type}</Chip>}
              {spotlightAnime.episodeCount && (
                <span>{spotlightAnime.episodeCount.sub || spotlightAnime.episodeCount.dub || 'Unknown'} Episodes</span>
              )}
              {spotlightAnime.rating && <span>⭐ {spotlightAnime.rating}</span>}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap'
            }}>
              <Button 
                color="primary"
                size="lg"
                startContent={<PlayIcon className="w-6 h-6" />}
                onPress={() => handleAnimeSelect(spotlightAnime)}
                className="focusable"
                style={{
                  backgroundColor: '#8B5CF6',
                  fontWeight: '600'
                }}
              >
                Watch Now
              </Button>
              <Button 
                variant="flat"
                color="default"
                size="lg"
                startContent={<InformationCircleIcon className="w-6 h-6" />}
                className="focusable"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontWeight: '600'
                }}
              >
                More Info
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content Sections */}
      <div style={sectionStyle}>
        {sections.map((section, _sectionIndex) => (
          <div key={section.title} className="px-safeH">
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1.5rem',
              color: '#ffffff'
            }}>
              {section.title}
            </h2>
            
            <div style={sectionContentStyle}>
              {section.loading ? (
                // Show skeleton loaders
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} style={{ flexShrink: 0 }}>
                    <SkeletonCard />
                  </div>
                ))
              ) : section.items.length > 0 ? (
                // Show actual content
                section.items.map((anime) => (
                  <div key={anime.id} style={{ flexShrink: 0 }}>
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
                <div style={{
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: '1.125rem',
                  padding: '2rem 0'
                }}>
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