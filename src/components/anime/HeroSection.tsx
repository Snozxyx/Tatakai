import { Star, Play } from "lucide-react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SpotlightAnime, getProxiedImageUrl } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AddToPlaylistButton } from '@/components/playlist/AddToPlaylistButton';

interface HeroSectionProps {
  spotlight: SpotlightAnime;
  spotlights?: SpotlightAnime[];
}

export function HeroSection({ spotlight, spotlights = [] }: HeroSectionProps) {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const allSpotlights = spotlights.length > 0 ? spotlights.slice(0, 5) : [spotlight];
  const activeSpotlight = allSpotlights[currentIndex] || spotlight;

  // Auto-rotate spotlights
  useEffect(() => {
    if (allSpotlights.length <= 1) return;
    
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % allSpotlights.length);
        setIsTransitioning(false);
      }, 400);
    }, 6000);

    return () => clearInterval(interval);
  }, [allSpotlights.length]);

  const handleWatch = () => {
    navigate(`/anime/${activeSpotlight.id}`);
  };

  return (
    <section className="relative mb-16 md:mb-24">
      {/* Mobile Layout - Stacked with poster background */}
      <div className="lg:hidden relative">
        {/* Background poster with gradient overlay */}
        <div className="absolute inset-0 h-[400px] overflow-hidden">
          <img 
            src={getProxiedImageUrl(activeSpotlight.poster)} 
            alt="" 
            className="w-full h-full object-cover filter blur-sm scale-110 brightness-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>

        {/* Mobile content */}
        <div className={`relative z-10 pt-8 px-2 transition-all duration-500 ${
          isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}>
          {/* Small poster + info */}
          <div className="flex gap-4 mb-6">
            <div className="w-32 flex-shrink-0">
              <GlassPanel className="overflow-hidden rounded-xl">
                <img 
                  src={getProxiedImageUrl(activeSpotlight.poster)} 
                  alt={activeSpotlight.name}
                  className="w-full aspect-[3/4] object-cover"
                />
              </GlassPanel>
            </div>
            
            <div className="flex-1 min-w-0 py-2">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber/30 bg-amber/10 text-amber text-[10px] font-bold tracking-wider uppercase mb-2">
                <Star className="w-2.5 h-2.5 fill-amber" />
                #{activeSpotlight.rank} Spotlight
              </div>
              
              <h1 className="font-display text-xl font-black tracking-tight leading-tight gradient-text mb-2 line-clamp-2">
                {activeSpotlight.name}
              </h1>
              
              <div className="flex flex-wrap gap-1.5 mb-3">
                {activeSpotlight.otherInfo.slice(0, 3).map((info, idx) => (
                  <span 
                    key={idx} 
                    className="px-2 py-0.5 rounded-md border border-border bg-muted/50 text-[10px] font-medium"
                  >
                    {info}
                  </span>
                ))}
              </div>
              
              <div className="text-xs text-muted-foreground">
                SUB: {activeSpotlight.episodes.sub} | DUB: {activeSpotlight.episodes.dub || 'N/A'}
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4 px-1">
            {activeSpotlight.description}
          </p>

          {/* Action buttons - full width on mobile */}
          <div className="flex gap-3">
            <button 
              onClick={handleWatch}
              className="flex-1 h-12 rounded-full bg-foreground text-background font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Play className="w-4 h-4 fill-background" />
              Watch Now
            </button>
            <AddToPlaylistButton
              animeId={activeSpotlight.id}
              animeName={activeSpotlight.name}
              animePoster={activeSpotlight.poster}
              variant="icon"
              className="h-12 w-12 rounded-full border border-border bg-muted/50 flex items-center justify-center hover:bg-muted transition-all shadow-lg"
            />
          </div>

          {/* Navigation dots */}
          {allSpotlights.length > 1 && (
            <div className="flex items-center justify-center gap-2 pt-6">
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setIsTransitioning(false);
                    }, 300);
                  }}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentIndex 
                      ? 'w-6 h-1.5 bg-foreground' 
                      : 'w-1.5 h-1.5 bg-muted-foreground/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Layout - Side by side */}
      <div className="hidden lg:grid grid-cols-12 gap-8 items-center">
        {/* Typography & Info (Left) */}
        <div className={`col-span-5 space-y-8 z-20 transition-all duration-500 ${
          isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 animate-fade-in'
        }`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-bold tracking-wider uppercase">
            <Star className="w-3 h-3 fill-amber" />
            #{activeSpotlight.rank} Spotlight
          </div>
          
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] gradient-text">
            {activeSpotlight.name.split(" ").slice(0, 2).join(" ")}
            {activeSpotlight.name.split(" ").length > 2 && (
              <>
                <br />
                <span className="text-foreground/60">{activeSpotlight.name.split(" ").slice(2).join(" ")}</span>
              </>
            )}
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-md leading-relaxed border-l-2 border-border pl-6 line-clamp-3">
            {activeSpotlight.description}
          </p>

          <div className="flex flex-wrap gap-3">
            {activeSpotlight.otherInfo.slice(0, 4).map((info, idx) => (
              <span 
                key={idx} 
                className="px-4 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium hover:bg-muted cursor-default transition-colors"
              >
                {info}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-4">
            <button 
              onClick={handleWatch}
              className="h-14 px-8 rounded-full bg-foreground text-background font-bold text-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 glow-primary"
            >
              <Play className="w-5 h-5 fill-background" />
              Watch Now
            </button>
            <AddToPlaylistButton
              animeId={activeSpotlight.id}
              animeName={activeSpotlight.name}
              animePoster={activeSpotlight.poster}
              variant="icon"
              className="h-14 w-14 rounded-full border border-border bg-muted/50 flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-all"
            />
          </div>

          {/* Navigation dots */}
          {allSpotlights.length > 1 && (
            <div className="flex items-center gap-2 pt-4">
              {allSpotlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setCurrentIndex(idx);
                      setIsTransitioning(false);
                    }, 300);
                  }}
                  className={`transition-all duration-300 rounded-full ${
                    idx === currentIndex 
                      ? 'w-8 h-2 bg-foreground' 
                      : 'w-2 h-2 bg-muted-foreground/50 hover:bg-muted-foreground'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Graphic/Image (Right) */}
        <div className={`col-span-7 relative h-[650px] transition-all duration-500 ${
          isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100 animate-fade-in animation-delay-200'
        }`}>
          {/* Background Glow behind image */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-gradient-to-br from-primary/40 to-secondary/40 rounded-full blur-[100px] opacity-40 animate-pulse-slow" />
          
          <GlassPanel className="w-full h-full p-2 rotate-[-2deg] hover:rotate-0 transition-transform duration-700 ease-out group">
            <div className="relative w-full h-full rounded-2xl overflow-hidden">
              <img 
                src={getProxiedImageUrl(activeSpotlight.poster)} 
                alt={activeSpotlight.name} 
                className="w-full h-full object-cover filter brightness-90 contrast-110 transition-transform duration-700 group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
              
              {/* Embedded Metadata in Image */}
              <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Episodes</div>
                  <div className="text-foreground font-medium">
                    SUB: {activeSpotlight.episodes.sub} | DUB: {activeSpotlight.episodes.dub || 'N/A'}
                  </div>
                </div>
                <div className="text-6xl font-black text-foreground/10 tracking-widest font-display">
                  #{activeSpotlight.rank}
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Floating Element */}
          <GlassPanel className="absolute -bottom-10 -left-10 p-6 w-64 rotate-[3deg] z-30 animate-float">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-muted-foreground">JAPANESE</span>
              <Star className="w-4 h-4 text-amber fill-amber" />
            </div>
            <div className="text-lg font-bold text-foreground mb-1 line-clamp-1">{activeSpotlight.jname}</div>
            <div className="text-xs text-muted-foreground">Original Title</div>
          </GlassPanel>
        </div>
      </div>
    </section>
  );
}