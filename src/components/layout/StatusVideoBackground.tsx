import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const VIDEO_SOURCES = [
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/3.mp4',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/2.webm',
  'https://xkbzamfyupjafugqeaby.supabase.co/storage/v1/object/public/Public/bg/1.mp4',
];

interface StatusVideoBackgroundProps {
  overlayColor?: string;
}

export function StatusVideoBackground({ 
  overlayColor = "from-background/95 via-background/90 to-background/80" 
}: StatusVideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    // Pick a random video on mount
    const randomVideo = VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
    setSource(randomVideo);
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden" style={{ zIndex: -1 }}>
      {source && (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        >
          <source src={source} type={source.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
      )}
      
      {/* Gradient Overlay for readability */}
      <div className={`absolute inset-0 bg-gradient-to-b ${overlayColor}`} />
      
      {/* Noise texture overlay for texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />
    </div>
  );
}
