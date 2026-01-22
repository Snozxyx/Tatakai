import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Share2 } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function PublicPlaylistPage() {
  const { shareSlug } = useParams<{ shareSlug: string }>();
  const [searchParams] = useSearchParams();
  const [playlist, setPlaylist] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const embed = searchParams.get('embed') === '1';

  useEffect(() => {
    if (!shareSlug) return;
    setLoading(true);
    fetch(`/api/public/playlists/${encodeURIComponent(shareSlug)}`)
      .then(r => r.json())
      .then((d) => {
        setPlaylist(d.data ?? null);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => setLoading(false));
  }, [shareSlug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!playlist) return <div className="min-h-screen flex items-center justify-center">Playlist not found</div>;

  const { name, share_description, playlist_items = [], profiles } = playlist;
  const owner = profiles?.display_name || profiles?.id || 'Unknown';

  const shareUrl = `${window.location.origin}/p/${shareSlug}`;
  const embedCode = `<iframe src="${shareUrl}?embed=1" width="600" height="400" frameborder="0" scrolling="no"></iframe>`;

  return (
    <div className={embed ? 'bg-transparent p-4' : 'min-h-screen bg-background text-foreground p-6'}>
      <div className={embed ? 'max-w-full' : 'max-w-4xl mx-auto'}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            <p className="text-sm text-muted-foreground">By {owner}</p>
            {share_description && <p className="mt-2 text-sm text-muted-foreground">{share_description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Link copied'); }} className="gap-2">
              <Share2 className="w-4 h-4" />
              Copy Link
            </Button>
            {!embed && playlist.embed_allowed && (
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied'); }} className="gap-2">
                Copy Embed
              </Button>
            )}
          </div>
        </div>

        {playlist_items.length > 0 ? (
          <div className="space-y-2">
            {playlist_items.map((item: any, idx: number) => (
              <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl bg-muted/10">
                <div className="w-16 h-20 rounded overflow-hidden">
                  <img src={getProxiedImageUrl(item.anime_poster || '/placeholder.svg')} alt={item.anime_name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-semibold">{item.anime_name}</div>
                  <div className="text-sm text-muted-foreground">Added {new Date(item.added_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">This playlist is empty</div>
        )}
      </div>
    </div>
  );
}
