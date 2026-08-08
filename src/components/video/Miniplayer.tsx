import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { playbackEventBus, PlayerEvents } from '@/core/player/PlaybackEventBus';
import { useNavigate } from 'react-router-dom';

export function Miniplayer() {
  const [active, setActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubPlay = playbackEventBus.on(PlayerEvents.PLAY, () => setIsPlaying(true));
    const unsubPause = playbackEventBus.on(PlayerEvents.PAUSE, () => setIsPlaying(false));
    const unsubTime = playbackEventBus.on(PlayerEvents.TIME_UPDATE, (t) => setCurrentTime(t));
    const unsubDur = playbackEventBus.on(PlayerEvents.DURATION_CHANGE, (d) => setDuration(d));
    
    // Logic to show miniplayer when not on WatchPage
    const checkRoute = () => {
      const isWatchPage = window.location.pathname.startsWith('/watch');
      // Only activate if we have a source and are NOT on the watch page
      setActive(!isWatchPage && duration > 0);
    };

    checkRoute();
    window.addEventListener('popstate', checkRoute);
    
    return () => {
      unsubPlay();
      unsubPause();
      unsubTime();
      unsubDur();
      window.removeEventListener('popstate', checkRoute);
    };
  }, [duration]);

  if (!active) return null;

  const togglePlay = () => {
    if (isPlaying) playbackEventBus.emit('pause');
    else playbackEventBus.emit('play');
  };

  const close = () => {
    playbackEventBus.emit('stop'); // Need to handle this in adapters
    setActive(false);
  };

  const expand = () => {
    // Navigate back to the last watch page or use stored animeId/episodeId
    navigate(-1);
  };

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragConstraints={{ left: 0, right: window.innerWidth - 320, top: 0, bottom: window.innerHeight - 180 }}
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 50 }}
        className="fixed bottom-6 right-6 w-80 aspect-video bg-black rounded-xl border border-white/10 shadow-2xl overflow-hidden z-[999] cursor-move"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        {/* Controls Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
           <button onClick={togglePlay} className="p-3 bg-primary rounded-full shadow-lg">
             {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
           </button>
        </div>

        {/* Top Controls */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 hover:opacity-100 transition-opacity">
          <button onClick={expand} className="p-1.5 bg-black/40 hover:bg-black/60 rounded-md">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={close} className="p-1.5 bg-black/40 hover:bg-black/60 rounded-md text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-primary" 
            style={{ width: `${(currentTime / duration) * 100}%` }} 
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
