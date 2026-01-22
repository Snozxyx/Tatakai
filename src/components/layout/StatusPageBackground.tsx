import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const VIDEO_SOURCES = [
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/3.mp4',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/2.webm',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/1.mp4',
];

interface StatusPageBackgroundProps {
  overlayColor?: string;
  overlayOpacity?: number;
}

export const StatusPageBackground = ({ 
  overlayColor = 'from-background/95 via-background/80 to-background/95',
  overlayOpacity = 1 
}: StatusPageBackgroundProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setCurrentVideoIndex((prev) => (prev + 1) % VIDEO_SOURCES.length);
    };

    const handleCanPlay = () => {
      setIsLoaded(true);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentVideoIndex]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Video Background */}
      <motion.video
        ref={videoRef}
        key={currentVideoIndex}
        src={VIDEO_SOURCES[currentVideoIndex]}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: isLoaded ? 1 : 0, scale: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      {/* Animated Gradient Overlay */}
      <motion.div 
        className={`absolute inset-0 bg-gradient-to-br ${overlayColor}`}
        style={{ opacity: overlayOpacity }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />

      {/* Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Animated Glow Orbs */}
      <motion.div
        className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        animate={{
          x: [0, 50, 0],
          y: [0, 30, 0],
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl"
        animate={{
          x: [0, -50, 0],
          y: [0, -30, 0],
          scale: [1.2, 1, 1.2],
          opacity: [0.5, 0.3, 0.5],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Scanlines Effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
        }}
      />
    </div>
  );
};