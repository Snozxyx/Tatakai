import { memo, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MIDNIGHT_LOFI_ROOM } from './config';

interface MidnightLofiSceneProps {
  compact?: boolean;
  paused?: boolean;
  scanlines?: boolean;
  japaneseAccents?: boolean;
  className?: string;
}

export const MidnightLofiScene = memo(function MidnightLofiScene({
  compact = false,
  paused = false,
  japaneseAccents = true,
  scanlines = true,
  className = '',
}: MidnightLofiSceneProps) {
  const shouldReduceMotion = useReducedMotion();
  const isAnimated = !paused && !shouldReduceMotion;

  // Gentle, floating summer breeze particles (soft sea shimmer motes)
  const particles = useMemo(() => {
    const count = compact ? 8 : 18;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${(i * 13 + 5) % 94}%`,
      top: `${(i * 19 + 8) % 86}%`,
      size: `${(i % 3) * 1.2 + 2}px`,
      duration: `${14 + (i % 5) * 4}s`,
      delay: `${(i % 4) * -3}s`,
      opacity: 0.2 + (i % 3) * 0.15,
    }));
  }, [compact]);

  return (
    <div
      className={`ml-scene ${compact ? 'ml-scene-compact' : ''} ${scanlines ? 'ml-scanlines' : ''} ${className}`}
      data-animated={isAnimated ? 'true' : 'false'}
      aria-hidden="true"
    >
      {/* Background artwork: Coastal Veranda & Summer Cloud Pillar */}
      <img
        src={MIDNIGHT_LOFI_ROOM}
        alt=""
        className="ml-scene-room"
        loading="eager"
        decoding="async"
      />

      {/* Atmospheric depth vignette and bottom shadow for text contrast */}
      <div className="ml-scene-vignette" />

      {/* Cinematic Viewfinder Corner Frame Marks */}
      <div className="ml-cinema-frame" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>

      {/* Cinematic Topline: Minimalist Lo-Fi metadata */}
      <div className="ml-scene-topline">
        <div className="ml-scene-title">
          <span className="ml-scene-wordmark">夜 の 部 屋</span>
          <span className="ml-scene-rec">TOKYO · AFTER HOURS</span>
        </div>
        {!compact && (
          <div className="ml-scene-nav">
            <span>夜</span>
            <span>静けさ</span>
            <span>音楽</span>
            <span className="ml-scene-nav-pill">MIDNIGHT</span>
          </div>
        )}
      </div>

      {/* Drifting sea breeze motes */}
      {isAnimated && (
        <div className="ml-scene-particles">
          {particles.map(p => (
            <span
              key={p.id}
              className="ml-particle"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                animationDuration: p.duration,
                animationDelay: p.delay,
                opacity: p.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* Vertical Japanese Calligraphy Overlay */}
      {japaneseAccents && (
        <div className="ml-scene-kanji-wrap">
          <span className="ml-scene-kanji-left">
            静<br />か<br />な<br />夜
          </span>
          <span className="ml-scene-kanji-right">
            夜<br />の<br />音
          </span>
        </div>
      )}

      {/* Letterbox Cinema Framing */}
      <div className="ml-letterbox-top" />
      <div className="ml-letterbox-bottom" />
    </div>
  );
});
