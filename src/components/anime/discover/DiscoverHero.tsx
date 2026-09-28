/**
 * Discover hero (docs/image-8.png): eyebrow, display heading, description, a
 * primary-gradient pill CTA and carousel dots on the left; the ranked poster fan
 * on the right, over a full-bleed backdrop tinted with the theme's accent.
 *
 * The backdrop is the leading title's banner rather than a static asset, so the
 * cast over it comes from whatever is actually #1 that week. The dots page
 * between the four boards in RANKED_BOARDS, and only the visible board is
 * fetched — the neighbours are warmed on hover.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHighQualityPoster } from '@/lib/api';
import {
  RANKED_BOARDS,
  mediaToPosterItem,
  useRankedBoard,
  usePrefetchRankedBoard,
} from '@/hooks/api/useDiscover';
import { RankedPosterRail } from './RankedPosterRail';

export function DiscoverHero({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const board = RANKED_BOARDS[index];
  const { data, isLoading } = useRankedBoard(board.id);
  const prefetch = usePrefetchRankedBoard();

  const media = data?.media ?? [];
  const leader = media[0];
  const backdrop = leader?.bannerImage
    ?? (leader ? getHighQualityPoster(leader.coverImageLarge ?? '', leader.anilistId) : undefined);

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[2rem] border border-white/[0.07] bg-card',
        className,
      )}
      aria-roledescription="carousel"
      aria-label="Ranked boards"
    >
      {/* Backdrop: the leader's banner, pushed back far enough to read text over. */}
      <AnimatePresence mode="wait">
        {backdrop && (
          <motion.img
            key={backdrop}
            src={backdrop}
            alt=""
            aria-hidden
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 0.38, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-card/60" />
      {/* The accent cast of the design, independent of the backdrop's own colour. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_110%,hsl(var(--primary)/0.28),transparent_60%)]" />

      <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-6 lg:p-14">
        <div className="max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={board.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                {board.eyebrow}
              </p>
              <h1 className="font-display mt-3 text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-5xl xl:text-[3.75rem]">
                {board.heading}
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55 sm:text-base">
                {board.description}
              </p>

              <Link
                to={board.cta.to}
                className="group mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-secondary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {board.cta.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.div>
          </AnimatePresence>

          {/* Dots sit outside the AnimatePresence so they stay put while the
              copy above them cross-fades. Active one widens into a bar. */}
          <div className="mt-8 flex items-center gap-2">
            {RANKED_BOARDS.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setIndex(i)}
                onMouseEnter={() => prefetch(entry.id)}
                onFocus={() => prefetch(entry.id)}
                aria-label={entry.heading}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  i === index ? 'w-8 bg-primary' : 'w-1.5 bg-white/25 hover:bg-white/50',
                )}
              />
            ))}
          </div>
        </div>

        {/* Stretched, not `justify-self-end`: the rail sizes its posters as a
            share of this column, which needs a definite width to resolve
            against. The rail right-aligns its own fan instead. */}
        <div className="min-w-0">
          <RankedPosterRail
            items={media.map((item, i) => mediaToPosterItem(item, i))}
            isLoading={isLoading}
          />
        </div>
      </div>
    </section>
  );
}
