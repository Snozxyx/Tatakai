import { useState, useEffect } from 'react';
import { MessageCircle, Users, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';

export function DiscordSection() {
  const [animeCharacter, setAnimeCharacter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnimeCharacter();
  }, []);

  const fetchAnimeCharacter = async () => {
    try {
      setIsLoading(true);
      // Using waifu.pics API for anime images
      const response = await fetch('https://api.waifu.pics/sfw/waifu');
      const data = await response.json();
      setAnimeCharacter(data.url);
    } catch (error) {
      console.error('Failed to fetch anime character:', error);
      // Fallback image
      setAnimeCharacter('https://placehold.co/400x600/1a1a2e/ffffff?text=Discord');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassPanel className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Content Side */}
        <div className="p-6 md:p-8 flex flex-col justify-center space-y-4">
          <div className="flex items-center gap-3 text-[#5865F2]">
            <div className="w-12 h-12 rounded-full bg-[#5865F2]/10 flex items-center justify-center">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-display font-bold">Join Our Discord</h2>
          </div>
          
          <p className="text-muted-foreground">
            Connect with thousands of anime fans, get updates, participate in events, 
            and chat about your favorite shows!
          </p>

          <div className="flex flex-wrap gap-4 py-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xl font-bold">10K+</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xl font-bold">24/7</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => window.open('https://discord.gg/Vr5GZFJszp', '_blank')}
            className="w-full md:w-auto bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2"
            size="lg"
          >
            <MessageCircle className="w-5 h-5" />
            Join Discord Server
            <ExternalLink className="w-4 h-4" />
          </Button>

          <p className="text-xs text-muted-foreground">
            Get exclusive roles, early access to features, and direct support!
          </p>
        </div>

        {/* Anime Character Side */}
        <div className="relative h-64 md:h-full min-h-[300px] overflow-hidden rounded-r-xl">
          {isLoading ? (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 animate-pulse" />
          ) : (
            <>
              <img
                src={animeCharacter}
                alt="Anime character"
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setAnimeCharacter('https://placehold.co/400x600/1a1a2e/ffffff?text=Discord')}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
            </>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
