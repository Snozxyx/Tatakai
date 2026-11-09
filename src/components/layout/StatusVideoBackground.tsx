import { backgroundVideo } from '@/lib/assets';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAppThemeBackground, useAppSystemBlur, useAppBackdropPortal } from './AppThemeBackground';

const VIDEO_SOURCES = ['1.mp4', '2.webm', '3.mp4', '5.mp4', '6.mp4'].map(backgroundVideo);

interface StatusVideoBackgroundProps {
  overlayColor?: string;
}

export function StatusVideoBackground({ 
  overlayColor = "from-background/95 via-background/90 to-background/80" 
}: StatusVideoBackgroundProps) {
  useUiTranslation();
  const custom = useAppThemeBackground();
  const systemBlur = useAppSystemBlur();
  const portal = useAppBackdropPortal();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    // Pick a random video on mount
    const randomVideo = VIDEO_SOURCES[Math.floor(Math.random() * VIDEO_SOURCES.length)];
    setSource(randomVideo);
  }, []);

  if (custom || (systemBlur && !portal)) return null;
  const background = (
    <div data-app-route-background className="fixed inset-0 w-full h-full overflow-hidden" style={{ zIndex: systemBlur ? 0 : -1 }}>
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
  return systemBlur ? createPortal(background, portal!) : background;
}
