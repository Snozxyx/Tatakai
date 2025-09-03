'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { AnimeAPI, type EpisodeServersResponse, type EpisodeSourcesResponse, type AnimeEpisodesResponse, type Episode, type AnimeInfoResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, ArrowLeft, SkipBack, SkipForward, Star, Clock, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import VideoPlayer from '@/components/VideoPlayer';
import Image from 'next/image';

const WatchPage = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const animeId = params?.id as string;
  const episodeParam = searchParams?.get('ep');
  
  const [episodes, setEpisodes] = useState<AnimeEpisodesResponse | null>(null);
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string>('');
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [servers, setServers] = useState<EpisodeServersResponse | null>(null);
  const [sources, setSources] = useState<EpisodeSourcesResponse | null>(null);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'sub' | 'dub' | 'raw'>('sub');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animeInfo, setAnimeInfo] = useState<AnimeInfoResponse['data']['anime'] | null>(null);

  const fetchSources = useCallback(async (episodeId: string, server: string, category: 'sub' | 'dub' | 'raw') => {
    try {
      console.log(`Fetching sources for server: ${server}, category: ${category}`);
      const sourcesData = await AnimeAPI.getEpisodeSources(episodeId, server, category);
      
      if (sourcesData.success) {
        setSources(sourcesData);
        console.log('=== SOURCES DEBUG ===');
        console.log('Full sources response:', JSON.stringify(sourcesData, null, 2));
        console.log('Sources array:', sourcesData.data.sources);
        console.log('Tracks array:', sourcesData.data.tracks);
        console.log('Headers:', sourcesData.data.headers);
        console.log('=====================');
      } else {
        console.error('Sources API returned success: false');
        throw new Error('Failed to load video sources');
      }
    } catch (err) {
      console.error('Error fetching sources:', err);
      setError(`Unable to load video sources: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  useEffect(() => {
    const fetchEpisodeData = async () => {
      console.log('=== WATCH PAGE DEBUG ===');
      console.log('animeId:', animeId);
      console.log('episodeParam from searchParams:', episodeParam);
      
      if (!animeId) {
        setError('No anime ID provided');
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        // First, get the episodes list for this anime
        console.log('Fetching episodes for anime:', animeId);
        const episodesData = await AnimeAPI.getAnimeEpisodes(animeId);
        
        // Also try to get anime info for additional details
        try {
          const animeData = await AnimeAPI.getAnimeInfo(animeId);
          if (animeData.success) {
            setAnimeInfo(animeData.data.anime);
          }
        } catch (err) {
          console.log('Could not fetch anime info:', err);
        }
        
        if (!episodesData.success || !episodesData.data.episodes.length) {
          setError('No episodes found for this anime');
          setLoading(false);
          return;
        }
        
        setEpisodes(episodesData);
        
        // Determine which episode to load
        let targetEpisode;
        if (episodeParam) {
          // If episodeParam is a simple number, find the episode by number
          if (/^\d+$/.test(episodeParam)) {
            const episodeNumber = parseInt(episodeParam);
            targetEpisode = episodesData.data.episodes.find(ep => ep.number === episodeNumber);
          } else {
            // If episodeParam is already a full episode ID, find it in episodes or create a placeholder
            const foundEpisode = episodesData.data.episodes.find(ep => ep.episodeId === episodeParam);
            if (foundEpisode) {
              targetEpisode = foundEpisode;
            } else {
              // Create a placeholder episode for unknown episode ID
              targetEpisode = {
                title: `Episode ${episodeParam}`,
                episodeId: episodeParam,
                number: 1,
                isFiller: false
              };
            }
          }
        } else {
          // Default to first episode
          targetEpisode = episodesData.data.episodes[0];
        }
        
        if (!targetEpisode) {
          setError(`Episode ${episodeParam} not found`);
          setLoading(false);
          return;
        }
        
        const episodeId = targetEpisode.episodeId;
        setCurrentEpisodeId(episodeId);
        setCurrentEpisode(targetEpisode);
        console.log('Using episode ID:', episodeId);
        
        // Fetch available servers for this episode
        console.log('Calling getEpisodeServers with:', episodeId);
        const serversData = await AnimeAPI.getEpisodeServers(episodeId);
        
        console.log('Servers response:', serversData);
        
        if (serversData.success) {
          setServers(serversData);
          
          // Auto-select first available server
          const availableServers = serversData.data.sub.length > 0 ? serversData.data.sub : 
                                 serversData.data.dub.length > 0 ? serversData.data.dub : 
                                 serversData.data.raw;
          
          if (availableServers.length > 0) {
            // Try servers in priority order: hd-2, hd-3, hd-1
            const serverPriority = ['hd-2', 'hd-3', 'hd-1'];
            let defaultServer = availableServers[0]; // fallback
            
            for (const serverName of serverPriority) {
              const server = availableServers.find(s => s.serverName === serverName);
              if (server) {
                defaultServer = server;
                break;
              }
            }
            
            setSelectedServer(defaultServer.serverName);
            
            // Determine category based on available servers
            if (serversData.data.sub.length > 0) setSelectedCategory('sub');
            else if (serversData.data.dub.length > 0) setSelectedCategory('dub');
            else if (serversData.data.raw.length > 0) setSelectedCategory('raw');
            
            // Fetch sources for default server
            await fetchSources(episodeId, defaultServer.serverName, selectedCategory);
          } else {
            setError('No servers available for this episode');
          }
        } else {
          setError('Failed to load episode servers');
        }
      } catch (err) {
        console.error('Error fetching episode data:', err);
        setError(`Unable to load episode: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchEpisodeData();
  }, [animeId, episodeParam, fetchSources, selectedCategory]);

  // Navigation functions
  const goToEpisode = (episodeNumber: number) => {
    router.push(`/watch/${animeId}?ep=${episodeNumber}`);
  };

  const goToPreviousEpisode = () => {
    if (!currentEpisode || !episodes) return;
    const currentNumber = currentEpisode.number;
    if (currentNumber > 1) {
      goToEpisode(currentNumber - 1);
    }
  };

  const goToNextEpisode = () => {
    if (!currentEpisode || !episodes) return;
    const currentNumber = currentEpisode.number;
    const maxEpisode = episodes.data.episodes.length;
    if (currentNumber < maxEpisode) {
      goToEpisode(currentNumber + 1);
    }
  };

  const handleServerChange = async (serverName: string) => {
    if (!currentEpisodeId) return;
    
    setSelectedServer(serverName);
    setLoading(true);
    
    try {
      await fetchSources(currentEpisodeId, serverName, selectedCategory);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (category: 'sub' | 'dub' | 'raw') => {
    if (!currentEpisodeId || !selectedServer) return;
    
    setSelectedCategory(category);
    setLoading(true);
    
    try {
      await fetchSources(currentEpisodeId, selectedServer, category);
    } finally {
      setLoading(false);
    }
  };

  if (!animeId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Anime not found</h2>
          <p className="text-muted-foreground">Please select a valid anime to watch.</p>
        </div>
      </div>
    );
  }

  if (loading && !sources) {
    return <WatchPageSkeleton />;
  }

  if (error && !sources) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Unable to load episode</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      {/* Navigation Header */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="text-white hover:text-rose-500 hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back
            </Button>
            
            {currentEpisode && episodes && (
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousEpisode}
                  disabled={currentEpisode.number <= 1}
                  className="text-white hover:text-rose-500 hover:bg-white/10 disabled:opacity-50"
                >
                  <SkipBack className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                
                <span className="text-white text-sm">
                  Episode {currentEpisode.number} of {episodes.data.episodes.length}
                </span>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextEpisode}
                  disabled={currentEpisode.number >= episodes.data.episodes.length}
                  className="text-white hover:text-rose-500 hover:bg-white/10 disabled:opacity-50"
                >
                  Next
                  <SkipForward className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="relative">
        <div className="aspect-video bg-black relative">
          {sources?.data.sources && sources.data.sources.length > 0 ? (
            <VideoPlayer 
              sources={sources.data.sources}
              subtitles={sources?.data?.tracks || []}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-center text-white">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-rose-500 mx-auto mb-4"></div>
                <p className="text-xl">Loading video...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Below Video */}
      <div className="bg-gradient-to-b from-black to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Episode Information */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50"
              >
                <div className="flex items-start space-x-6">
                  {animeInfo?.info?.poster && (
                    <div className="flex-shrink-0">
                      <Image
                        src={animeInfo.info.poster}
                        alt={animeInfo.info.name || 'Anime poster'}
                        width={120}
                        height={160}
                        className="rounded-xl object-cover shadow-lg"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-4">
                    <div>
                      <h1 className="text-3xl font-bold text-white mb-2">
                        {animeInfo?.info?.name || animeId}
                      </h1>
                      {currentEpisode && (
                        <h2 className="text-xl text-rose-400 font-medium">
                          Episode {currentEpisode.number}: {currentEpisode.title}
                        </h2>
                      )}
                    </div>
                    
                    {animeInfo && (
                      <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                        {animeInfo.info?.stats?.rating && (
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span>{animeInfo.info.stats.rating}</span>
                          </div>
                        )}
                        {animeInfo.moreInfo?.aired && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <span>{animeInfo.moreInfo.aired}</span>
                          </div>
                        )}
                        {animeInfo.moreInfo?.duration && (
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4 text-green-500" />
                            <span>{animeInfo.moreInfo.duration}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {animeInfo?.info?.description && (
                      <p className="text-gray-300 leading-relaxed line-clamp-3">
                        {animeInfo.info.description}
                      </p>
                    )}
                    
                    {animeInfo?.moreInfo?.genres && (
                      <div className="flex flex-wrap gap-2">
                        {animeInfo.moreInfo.genres.map((genre: string, index: number) => (
                          <Badge key={index} variant="secondary" className="bg-rose-500/20 text-rose-300 border-rose-500/30">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Server Selection */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="bg-card/50 backdrop-blur-sm rounded-2xl p-6 border border-border/50"
              >
                <h3 className="text-xl font-bold mb-4">Video Settings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-foreground">Category</label>
                    <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                      <SelectTrigger className="bg-card/50 border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {servers?.data.sub && servers.data.sub.length > 0 && (
                          <SelectItem value="sub" className="text-foreground hover:bg-muted">Subtitled</SelectItem>
                        )}
                        {servers?.data.dub && servers.data.dub.length > 0 && (
                          <SelectItem value="dub" className="text-foreground hover:bg-muted">Dubbed</SelectItem>
                        )}
                        {servers?.data.raw && servers.data.raw.length > 0 && (
                          <SelectItem value="raw" className="text-foreground hover:bg-muted">Raw</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-foreground">Server</label>
                    <Select value={selectedServer} onValueChange={handleServerChange}>
                      <SelectTrigger className="bg-card/50 border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {servers?.data[selectedCategory]?.map((server) => (
                          <SelectItem 
                            key={server.serverId} 
                            value={server.serverName}
                            className="text-foreground hover:bg-muted"
                          >
                            {server.serverName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Quality</label>
                    <Select defaultValue="auto">
                      <SelectTrigger className="bg-gray-700/50 border-gray-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        <SelectItem value="auto" className="text-white hover:bg-gray-700">Auto</SelectItem>
                        <SelectItem value="1080p" className="text-white hover:bg-gray-700">1080p</SelectItem>
                        <SelectItem value="720p" className="text-white hover:bg-gray-700">720p</SelectItem>
                        <SelectItem value="480p" className="text-white hover:bg-gray-700">480p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Episodes List */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700/50"
              >
                <h3 className="text-xl font-bold mb-4">Episodes</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                  {episodes?.data.episodes.map((episode) => (
                    <div
                      key={episode.episodeId}
                      onClick={() => goToEpisode(episode.number)}
                      className={`
                        group p-4 rounded-xl cursor-pointer transition-all duration-200 border
                        ${episode.number === currentEpisode?.number 
                          ? 'bg-rose-500/20 border-rose-500/50' 
                          : 'bg-card/30 border-border/50 hover:bg-card/50 hover:border-rose-500/30'}
                      `}
                    >
                      <div className="flex items-center space-x-4">
                        {/* Episode Thumbnail */}
                        <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-rose-500/20 to-purple-500/20">
                          {animeInfo?.info?.poster ? (
                            <Image
                              src={animeInfo.info.poster}
                              alt={`Episode ${episode.number}`}
                              fill
                              className="object-cover opacity-60"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-rose-500/30 to-purple-500/30 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {/* Episode Number Badge */}
                          <div className="absolute top-1 left-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                            {episode.number}
                          </div>
                        </div>

                        {/* Episode Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-semibold text-foreground group-hover:text-rose-400 transition-colors">
                              Episode {episode.number}
                            </h4>
                            {episode.isFiller && (
                              <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                                Filler
                              </Badge>
                            )}
                            {episode.number === currentEpisode?.number && (
                              <Badge variant="default" className="text-xs bg-rose-500/20 text-rose-400 border-rose-500/50">
                                Playing
                              </Badge>
                            )}
                          </div>
                          {episode.title && (
                            <p className="text-sm text-muted-foreground line-clamp-2 group-hover:text-muted-foreground/80 transition-colors">
                              {episode.title}
                            </p>
                          )}
                        </div>
                        
                        {/* Episode Duration/Play Icon */}
                        <div className="flex flex-col items-end space-y-1">
                          <Play className="w-4 h-4 flex-shrink-0 text-muted-foreground group-hover:text-rose-400 transition-colors" />
                          <span className="text-xs text-muted-foreground">~24min</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WatchPageSkeleton = () => (
  <div className="min-h-screen bg-black">
    <div className="aspect-video bg-gray-900">
      <Skeleton className="w-full h-full" />
    </div>
    <div className="bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-4">
              <div className="flex space-x-4">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default WatchPage;
