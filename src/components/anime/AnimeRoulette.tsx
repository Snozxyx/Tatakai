import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Curated list of popular anime IDs for roulette
const ROULETTE_ANIME_IDS = [
  'attack-on-titan',
  'demon-slayer-kimetsu-no-yaiba',
  'fullmetal-alchemist-brotherhood',
  'jujutsu-kaisen',
  'naruto',
  'one-piece',
  'death-note',
  'hunter-x-hunter-2011',
  'steins-gate',
  'code-geass-lelouch-of-the-rebellion',
  'bleach',
  'dragon-ball-z',
  'tokyo-ghoul',
  'sword-art-online',
  'my-hero-academia',
  'vinland-saga',
  'chainsaw-man',
  'spy-x-family',
  'overlord',
  'mushoku-tensei-jobless-reincarnation',
  'rezero-starting-life-in-another-world',
  'violet-evergarden',
  'a-silent-voice-the-movie',
  'your-name',
  'spirited-away',
  'made-in-abyss',
  'neon-genesis-evangelion',
  'cowboy-bebop',
  'one-punch-man',
  'mob-psycho-100',
];

interface AnimeRouletteProps {
  trendingAnimes?: { id: string | number; name: string }[];
  className?: string;
}

export function AnimeRoulette({ trendingAnimes, className }: AnimeRouletteProps) {
  const navigate = useNavigate();
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastPicked, setLastPicked] = useState<string | null>(null);

  const spin = useCallback(() => {
    if (isSpinning) return;
    setIsSpinning(true);

    // Build the pool from trending + curated list
    const pool: string[] = trendingAnimes && trendingAnimes.length > 0
      ? trendingAnimes.map(a => String(a.id))
      : ROULETTE_ANIME_IDS;

    // Pick random, avoid repeating last
    let pick: string;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pick === lastPicked && pool.length > 1);

    setLastPicked(pick);

    // Quick visual spin then navigate
    setTimeout(() => {
      setIsSpinning(false);
      navigate(`/anime/${pick}`);
    }, 900);
  }, [isSpinning, lastPicked, trendingAnimes, navigate]);

  return (
    <motion.button
      onClick={spin}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl overflow-hidden',
        'border border-border/40 bg-muted/30',
        'text-sm font-semibold transition-all duration-200',
        'hover:border-primary/30 hover:bg-primary/5',
        'hover:shadow-lg hover:shadow-primary/10',
        isSpinning && 'cursor-not-allowed',
        className
      )}
      disabled={isSpinning}
    >
      {/* Animated background shine */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
      </div>

      <AnimatePresence mode="wait">
        {isSpinning ? (
          <motion.div
            key="spinning"
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'linear' }}
          >
            <Shuffle className="w-4 h-4 text-primary" />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Shuffle className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </motion.div>
        )}
      </AnimatePresence>

      <span className={cn('relative', isSpinning && 'animate-pulse')}>
        {isSpinning ? 'Finding anime...' : 'Surprise me!'}
      </span>
    </motion.button>
  );
}
