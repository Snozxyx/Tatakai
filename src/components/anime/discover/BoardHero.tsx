/**
 * The board hero shared by the trending and favorites pages — the discover
 * hero's twin (docs/image-8.png).
 *
 * Same shell as `DiscoverHero`: the leading title's art pushed back under a
 * primary-tinted cast, copy on the left, the fanned ranked rail on the right.
 * What differs is the control: the discover hero pages between four boards with
 * its own dots, while this one takes whatever control the page owns (a timeframe
 * pill row, a collection filter) as `children` and renders it in the same slot.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RankedPosterRail } from './RankedPosterRail';
import type { PosterItem } from './types';

interface BoardHeroProps {
  eyebrow: string;
  heading: string;
  description: string;
  /** The title the copy and the CTA are about — rank 1, or the resume item. */
  leader?: PosterItem;
  /** Badge before the leader's name. `#1` on a ranking, `Resume` on a list. */
  leaderPrefix?: string;
  ctaLabel?: string;
  /** Pre-formatted chips, e.g. `12.4K views this week`. */
  stats?: string[];
  /** Wide art for the backdrop; falls back to the leader's poster. */
  backdrop?: string;
  items: PosterItem[];
  isLoading?: boolean;
  /** The page's own control, rendered where the discover hero puts its dots. */
  children?: ReactNode;
  className?: string;
}

export function BoardHero({
  eyebrow,
  heading,
  description,
  leader,
  leaderPrefix = '#1',
  ctaLabel,
  stats = [],
  backdrop,
  items,
  isLoading,
  children,
  className,
}: BoardHeroProps) {
  const { t } = useTranslation();
  const resolvedCtaLabel = ctaLabel ?? t('discover.watchNow');
  const art = backdrop || leader?.poster;

  return (
    <section
      className={cn(
        'relative w-full max-w-full overflow-hidden rounded-[2rem] border border-white/[0.07] bg-card',
        className,
      )}
    >
      <AnimatePresence mode="wait">
        {art && (
          <motion.img
            key={art}
            src={art}
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
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_110%,hsl(var(--primary)/0.28),transparent_60%)]" />

      <div className="relative grid w-full max-w-full grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:gap-10 sm:p-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-6 lg:p-14">
        <div className="w-full min-w-0 max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={heading}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full min-w-0 max-w-full"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                {eyebrow}
              </p>
              {/* 320px screens have ~250px of text width after card + page
                  padding: step down from text-3xl so long headings wrap
                  instead of clipping past the card edge. */}
              <h1 className="font-display mt-3 max-w-full break-words text-[1.7rem] font-black leading-[1.05] tracking-tight text-foreground min-[400px]:text-3xl sm:text-5xl xl:text-[3.75rem]">
                {heading}
              </h1>

              {leader && (
                <p className="mt-4 flex w-full min-w-0 max-w-full items-baseline gap-2 text-lg font-bold text-white/85">
                  {leaderPrefix && (
                    <span className="shrink-0 text-sm font-black uppercase tracking-wider text-primary">
                      {leaderPrefix}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{leader.title}</span>
                </p>
              )}

              <p className="mt-3 max-w-lg break-words text-sm leading-relaxed text-white/55 sm:text-base">
                {description}
              </p>

              {stats.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {stats.map((stat) => (
                    <span
                      key={stat}
                      className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70 backdrop-blur-sm"
                    >
                      {stat}
                    </span>
                  ))}
                </div>
              )}

              {leader && (
                <Link
                  to={leader.href}
                  className="group mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-secondary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Play className="h-4 w-4 fill-primary-foreground transition-transform group-hover:scale-110" />
                  {resolvedCtaLabel}
                </Link>
              )}
            </motion.div>
          </AnimatePresence>

          {children && <div className="mt-8 w-full min-w-0 max-w-full">{children}</div>}
        </div>

        {/* Stretched, not `justify-self-end`: the rail sizes its posters as a
            share of this column, which needs a definite width to resolve
            against. The rail right-aligns its own fan instead. */}
        <div className="w-full min-w-0 max-w-full">
          <RankedPosterRail items={items} isLoading={isLoading} />
        </div>
      </div>
    </section>
  );
}
