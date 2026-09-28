import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedJsonUrl } from '@/lib/api/proxy-utils';

const DISCORD_INVITE = 'https://dsc.gg/tatakai';

const PERKS = [
  'Exclusive roles and profile flair',
  'Early access to new features',
  'Direct line to the developers',
];

type Character = { url: string; source: string };
type Source = { name: string; fetchUrl: () => Promise<string | undefined> };

// Routed through the local API's /api/proxy/json passthrough — direct fetches to
// these hosts are blocked (403/CORS) from the desktop renderer and spam the console.
const CHARACTER_SOURCES: Source[] = [
  // waifu.im (verified working)

  // nekosia.cat (verified working, provides palette)
  {
    name: 'nekosia.cat',
    fetchUrl: () =>
      fetch(getProxiedJsonUrl('https://api.nekosia.cat/api/v1/images/random'))
        .then((r) => r.json())
        .then((d) => d?.image?.original?.url),
  },
];

// Decode off-screen first so the swap is a clean crossfade, never a pop-in.
function preload(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function fetchCharacterImage(): Promise<Character | null> {
  // Shuffle a copy (never mutate the module-level const) and try each source.
  const shuffled = [...CHARACTER_SOURCES].sort(() => Math.random() - 0.5);
  for (const source of shuffled) {
    try {
      const url = await source.fetchUrl();
      if (url && typeof url === 'string' && (await preload(url))) {
        return { url, source: source.name };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function DiscordLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" fill="currentColor" className={className} aria-hidden="true">
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

export function DiscordSection() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [hasAttempted, setHasAttempted] = useState(false);

  const refresh = useCallback(async () => {
    setIsFetching(true);
    const next = await fetchCharacterImage();
    if (next) setCharacter(next); // keep the current artwork if the refresh fails
    setHasAttempted(true);
    setIsFetching(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showSkeleton = !character && !hasAttempted;
  const showFallback = !character && hasAttempted;

  return (
    <GlassPanel className="relative overflow-hidden border border-[#5865F2]/20 bg-gradient-to-br from-[#5865F2]/[0.07] via-card to-card">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Content */}
        <div className="relative flex flex-col justify-center gap-7 p-8 md:p-12 lg:p-14">
          {/* Ambient brand tint */}
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#5865F2]/10 blur-3xl" />

          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#5865F2] shadow-lg shadow-[#5865F2]/20">
              <DiscordLogo className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5865F2]">
                Community
              </p>
              <h2 className="font-display text-2xl font-semibold leading-none tracking-tight md:text-3xl">
                Join our Discord
              </h2>
            </div>
          </div>

          <p className="relative max-w-md leading-relaxed text-muted-foreground">
            Chat with thousands of anime fans, catch release updates, join events,
            and talk about what you're watching.
          </p>

          {/* Stats */}
          <div className="relative flex items-center gap-6">
            <div>
              <p className="text-2xl font-semibold leading-none tabular-nums">100+</p>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Members
              </p>
            </div>
            <div className="h-9 w-px bg-white/10" />
            <div>
              <p className="flex items-center gap-2 text-2xl font-semibold leading-none">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                24/7
              </p>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Always active
              </p>
            </div>
          </div>

          {/* Perks */}
          <ul className="relative space-y-2.5">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-center gap-3 text-sm text-foreground/85">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/15 text-[#5865F2]">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {perk}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="relative pt-1">
            <Button
              onClick={() => window.open(DISCORD_INVITE, '_blank', 'noopener,noreferrer')}
              className="group h-12 rounded-xl bg-[#5865F2] px-6 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/20 transition-colors hover:bg-[#4752C4]"
            >
              <DiscordLogo className="mr-2.5 h-5 w-5" />
              Join the server
              <ExternalLink className="ml-2.5 h-4 w-4 opacity-70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Button>
            <p className="mt-3 text-xs text-muted-foreground/70">Free to join · opens in a new tab</p>
          </div>
        </div>

        {/* Artwork — sits on top on mobile, right on desktop */}
        <div className="relative order-first h-64 md:order-none md:h-auto md:min-h-[460px]">
          <AnimatePresence>
            {showSkeleton && (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#5865F2]/15 via-card to-card"
              />
            )}

            {character && (
              <motion.div
                key={character.url}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
              >
                <img
                  src={character.url}
                  alt="Anime character artwork"
                  className="h-full w-full object-cover object-top"
                  onError={() => setCharacter(null)}
                />
              </motion.div>
            )}

            {showFallback && (
              <motion.div
                key="fallback"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#5865F2]/5"
              >
                <DiscordLogo className="h-12 w-12 text-[#5865F2]/30" />
                <p className="text-xs text-muted-foreground">Artwork unavailable</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Blend into the panel: bottom fade on mobile, left fade on desktop */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent md:bg-gradient-to-r md:via-card/10" />
          {/* Footer vignette so controls stay legible over bright art */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-28 bg-gradient-to-t from-black/50 to-transparent md:block" />

          {/* Persistent controls */}
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 md:inset-x-5 md:bottom-5">
            {character ? (
              <span className="text-[10px] uppercase tracking-wider text-white/50">
                Art via {character.source}
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={isFetching}
              aria-label="Show another character"
              title="Show another character"
              className="group rounded-xl border border-white/10 bg-black/40 p-2.5 text-white/70 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  isFetching ? 'animate-spin' : 'transition-transform duration-500 group-hover:rotate-180'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}