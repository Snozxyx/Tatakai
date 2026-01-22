import { Link, useNavigate } from 'react-router-dom';
import { usePlaylists, usePlaylistItems, Playlist } from '@/hooks/usePlaylist';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Music2, Plus, ChevronRight, Play, Lock, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// Mini playlist card with cover grid
function PlaylistMiniCard({ playlist }: { playlist: Playlist }) {
  const { data: items = [] } = usePlaylistItems(playlist.id);
  const navigate = useNavigate();
  const coverImages = items.slice(0, 4).map(item => item.anime_poster).filter(Boolean) as string[];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group cursor-pointer"
      onClick={() => navigate(`/playlist/${playlist.id}`)}
    >
      <div className="relative aspect-square rounded-xl overflow-hidden bg-muted mb-2 transition-all group-hover:ring-2 group-hover:ring-primary/50 group-hover:scale-[1.02]">
        {coverImages.length > 0 ? (
          <div className={cn(
            "grid w-full h-full",
            coverImages.length === 1 && "grid-cols-1",
            coverImages.length === 2 && "grid-cols-2",
            coverImages.length >= 3 && "grid-cols-2 grid-rows-2"
          )}>
            {coverImages.map((img, idx) => (
              <img
                key={idx}
                src={getProxiedImageUrl(img)}
                alt=""
                className="w-full h-full object-cover"
              />
            ))}
            {coverImages.length === 3 && (
              <div className="bg-muted/50 flex items-center justify-center">
                <Music2 className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-purple-500/20">
            <Music2 className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
            <Play className="w-5 h-5 text-primary-foreground fill-current ml-0.5" />
          </div>
        </div>

        {/* Privacy badge */}
        <div className={cn(
          "absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center",
          playlist.is_public ? "bg-green-500/20 text-green-400" : "bg-muted/80 text-muted-foreground"
        )}>
          {playlist.is_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        </div>
      </div>
      
      <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
        {playlist.name}
      </h3>
      <p className="text-xs text-muted-foreground">
        {playlist.items_count} anime
      </p>
    </motion.div>
  );
}

export function PlaylistSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: playlists = [], isLoading } = usePlaylists();

  // Don't show section if not logged in
  if (!user) return null;

  // Don't show if loading
  if (isLoading) {
    return (
      <section className="mt-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Music2 className="w-6 h-6 text-primary" />
            My Playlists
          </h2>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square bg-muted rounded-xl animate-pulse" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-2 bg-muted rounded animate-pulse w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mt-16">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Music2 className="w-6 h-6 text-primary" />
          My Playlists
        </h2>
        <Link 
          to="/playlists"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          View All
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {playlists.length > 0 ? (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* Create new playlist card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group cursor-pointer"
            onClick={() => navigate('/playlists')}
          >
            <div className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition-all group-hover:bg-primary/5">
              <div className="w-12 h-12 rounded-full bg-muted group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                Create New
              </span>
            </div>
          </motion.div>

          {/* Existing playlists (show up to 5) */}
          {playlists.slice(0, 5).map((playlist) => (
            <PlaylistMiniCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-6 p-6 rounded-2xl bg-muted/30 border border-white/5">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Music2 className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">Create your first playlist</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Organize your favorite anime into playlists to watch later
            </p>
            <Button size="sm" onClick={() => navigate('/playlists')} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Playlist
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
