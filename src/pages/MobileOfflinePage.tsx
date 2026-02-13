/**
 * Mobile Offline Library Page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Download, Trash2, Play, HardDrive, FolderOpen } from 'lucide-react';
import { useOfflineLibrary, useMobileDownload } from '@/hooks/useMobileDownload';
import { OfflineEpisode } from '@/services/mobileDownloadService';
import { toast } from 'sonner';
import { MobileDownloadsUI } from '@/components/mobile/MobileDownloadsUI';

export default function MobileOfflinePage() {
  const navigate = useNavigate();
  const { isNative, episodes, loading, deleteEpisode } = useOfflineLibrary();
  const { activeDownloads } = useMobileDownload();
  const [deleteTarget, setDeleteTarget] = useState<OfflineEpisode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isNative) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassPanel className="p-8 text-center max-w-md">
          <HardDrive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Mobile Only</h2>
          <p className="text-muted-foreground mb-4">Downloads are only available in the mobile app.</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </GlassPanel>
      </div>
    );
  }

  // Group by anime
  const grouped = episodes.reduce((acc, ep) => {
    if (!acc[ep.animeId]) {
      acc[ep.animeId] = {
        animeId: ep.animeId,
        animeTitle: ep.animeTitle,
        poster: ep.poster,
        episodes: [],
      };
    }
    acc[ep.animeId].episodes.push(ep);
    return acc;
  }, {} as Record<string, { animeId: string; animeTitle: string; poster?: string; episodes: OfflineEpisode[] }>);

  const animeList = Object.values(grouped).map(a => ({
    ...a,
    episodes: a.episodes.sort((x, y) => {
      if (x.season !== y.season) return x.season - y.season;
      return x.episode - y.episode;
    }),
  }));

  const handlePlay = (ep: OfflineEpisode) => {
    navigate(`/watch/${ep.animeId}?season=${ep.season}&episode=${ep.episode}&offline=true`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteEpisode(deleteTarget.animeId, deleteTarget.season, deleteTarget.episode);
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="min-h-screen">
      <Background />
      <MobileNav />

      <main className="pb-28 pt-4">
        <div className="container mx-auto px-4 max-w-3xl">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <FolderOpen className="w-7 h-7 text-primary" />
              <h1 className="text-2xl font-bold">Downloads</h1>
            </div>
            <p className="text-muted-foreground text-sm">Watch offline</p>
          </div>

          {/* Active */}
          {activeDownloads.length > 0 && (
            <GlassPanel className="p-4 mb-6 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-sm font-medium">
                  {activeDownloads.length} downloading...
                </span>
              </div>
            </GlassPanel>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : animeList.length === 0 ? (
            <GlassPanel className="p-12 text-center">
              <HardDrive className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Downloads</h3>
              <p className="text-muted-foreground mb-6">
                Download episodes from the video player
              </p>
              <Button onClick={() => navigate('/')}>Browse Anime</Button>
            </GlassPanel>
          ) : (
            <div className="space-y-6">
              {animeList.map((anime) => (
                <GlassPanel key={anime.animeId} className="p-4 rounded-xl">
                  <div className="flex gap-4 mb-4">
                    {anime.poster && (
                      <img src={anime.poster} alt="" className="w-16 h-24 object-cover rounded-lg" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{anime.animeTitle}</h3>
                      <Badge variant="secondary" className="mt-1">
                        <Download className="w-3 h-3 mr-1" />
                        {anime.episodes.length} episode{anime.episodes.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {anime.episodes.map((ep) => (
                      <div
                        key={`${ep.season}-${ep.episode}`}
                        className="flex items-center gap-3 p-3 rounded-lg bg-background/50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">S{ep.season} E{ep.episode}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(ep.downloadedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handlePlay(ep)}>
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => setDeleteTarget(ep)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Episode?</DialogTitle>
            <DialogDescription>
              Delete S{deleteTarget?.season}E{deleteTarget?.episode} of "{deleteTarget?.animeTitle}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileDownloadsUI />
    </div>
  );
}
