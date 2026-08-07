import { useState, useEffect } from 'react';
import { MessageCircle, Users, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { motion, AnimatePresence } from 'framer-motion';

const CHARACTER_SOURCES = [
  // waifu.im (verified working)
  () => fetch('https://api.waifu.im/search?included_tags=waifu&is_nsfw=false&many=false')
    .then(r => r.json())
    .then(d => d?.images?.[0]?.url),

  () => fetch('https://api.waifu.im/search?included_tags=neko&is_nsfw=false&many=false')
    .then(r => r.json())
    .then(d => d?.images?.[0]?.url),

  () => fetch('https://api.waifu.im/search?included_tags=uniform&is_nsfw=false&many=false')
    .then(r => r.json())
    .then(d => d?.images?.[0]?.url),

  // nekosia.cat (verified working, provides palette)
  () => fetch('https://api.nekosia.cat/api/v1/images/catgirl?additionalTags=cute')
    .then(r => r.json())
    .then(d => d?.image?.original?.url),
];

async function fetchCharacterImage(): Promise<string | null> {
  // Shuffle and try each source, return first success
  const shuffled = CHARACTER_SOURCES.sort(() => Math.random() - 0.5);
  for (const fetcher of shuffled) {
    try {
      const url = await fetcher();
      if (url && typeof url === 'string') return url;
    } catch { /* try next */ }
  }
  return null;
}

export function DiscordSection() {
  const [characterUrl, setCharacterUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    const url = await fetchCharacterImage();
    setCharacterUrl(url);
    setIsLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <GlassPanel className="overflow-hidden border border-[#5865F2]/20 bg-gradient-to-br from-[#5865F2]/5 via-card to-card">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Content Side */}
        <div className="p-8 md:p-12 flex flex-col justify-center space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center shadow-lg shadow-[#5865F2]/10">
              <MessageCircle className="w-7 h-7 text-[#5865F2]" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5865F2] mb-1">Community</p>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none">Join Our Discord</h2>
            </div>
          </div>

          <p className="text-muted-foreground leading-relaxed font-medium">
            Connect with thousands of anime fans, get updates, participate in events,
            and chat about your favorite shows!
          </p>

          <div className="flex flex-wrap gap-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#5865F2]" />
                <p className="text-2xl font-black">10K+</p>
              </div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Members</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-2xl font-black">24/7</p>
              </div>
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Always Active</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => window.open('https://dsc.gg/tatakai', '_blank')}
              className="bg-[#5865F2] hover:bg-[#4752C4] text-white h-14 px-8 rounded-2xl font-black text-base shadow-xl shadow-[#5865F2]/25 hover:scale-105 active:scale-95 transition-all"
            >
              <MessageCircle className="w-5 h-5 mr-3" />
              Join Discord Server
              <ExternalLink className="w-4 h-4 ml-3" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/60 font-medium">
            Get exclusive roles, early access to features, and direct developer support!
          </p>
        </div>

        {/* Character Side */}
        <div className="relative h-72 md:h-full min-h-[320px] overflow-hidden">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gradient-to-br from-[#5865F2]/20 via-primary/10 to-secondary/10 animate-pulse"
              />
            ) : characterUrl ? (
              <motion.div
                key={characterUrl}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0"
              >
                <img
                  src={characterUrl}
                  alt="Anime character"
                  className="w-full h-full object-cover object-top"
                  onError={() => setCharacterUrl(null)}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-card via-card/30 to-transparent md:via-transparent" />
                <button
                  onClick={refresh}
                  className="absolute bottom-4 right-4 p-2.5 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 text-white/60 hover:text-white hover:bg-black/60 transition-all"
                  title="Refresh character"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="fallback"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-gradient-to-br from-[#5865F2]/10 to-primary/10 flex items-center justify-center"
              >
                <button onClick={refresh} className="p-4 rounded-2xl bg-white/5 border border-white/10 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                  <RefreshCw className="w-8 h-8" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GlassPanel>
  );
}