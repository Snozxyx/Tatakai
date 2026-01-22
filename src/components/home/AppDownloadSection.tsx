import { useState, useEffect } from 'react';
import { Smartphone, Download, ExternalLink, Apple } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';

export function AppDownloadSection() {
  const [animeCharacter, setAnimeCharacter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnimeCharacter();
  }, []);

  const fetchAnimeCharacter = async () => {
    try {
      setIsLoading(true);
      // Using waifu.pics API for anime images
      const response = await fetch('https://api.waifu.pics/sfw/neko');
      const data = await response.json();
      setAnimeCharacter(data.url);
    } catch (error) {
      console.error('Failed to fetch anime character:', error);
      // Fallback image
      setAnimeCharacter('https://placehold.co/400x600/1a1a2e/ffffff?text=Mobile+App');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassPanel className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Anime Character Side */}
        <div className="relative h-64 md:h-full min-h-[300px] overflow-hidden rounded-l-xl order-2 md:order-1">
          {isLoading ? (
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/20 to-primary/20 animate-pulse" />
          ) : (
            <>
              <img
                src={animeCharacter}
                alt="Anime character"
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setAnimeCharacter('https://placehold.co/400x600/1a1a2e/ffffff?text=Mobile+App')}
              />
              <div className="absolute inset-0 bg-gradient-to-l from-background via-transparent to-transparent" />
            </>
          )}
        </div>

        {/* Content Side */}
        <div className="p-6 md:p-8 flex flex-col justify-center space-y-4 order-1 md:order-2">
          <div className="flex items-center gap-3 text-primary">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-6 h-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold">Get Our Mobile App</h2>
          </div>
          
          <p className="text-muted-foreground">
            Watch anime on the go! Download our mobile app for the best streaming experience 
            with offline downloads, push notifications, and more.
          </p>

          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <span>Download episodes for offline viewing</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <span>Get notified when new episodes air</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <span>Seamless sync across all devices</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => window.location.href = '/download'}
              className="flex-1 gap-2"
              size="lg"
            >
              <Download className="w-5 h-5" />
              Download Our App
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Free to download. Available on Android 8.0+ and iOS 13+
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
