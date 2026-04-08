import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Share2 } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function normalizeOwnerName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
  return isUuid ? null : trimmed;
}

function extractOwnerId(payload: any): string | null {
  const candidate =
    payload?.user_id ||
    payload?.profiles?.user_id ||
    payload?.profiles?.id ||
    payload?.owner?.user_id ||
    payload?.owner?.id;

  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveOwnerFromPayload(payload: any): string | null {
  return (
    normalizeOwnerName(payload?.profiles?.display_name) ||
    normalizeOwnerName(payload?.profiles?.username) ||
    normalizeOwnerName(payload?.owner?.display_name) ||
    normalizeOwnerName(payload?.owner?.username)
  );
}

export default function PublicPlaylistPage() {
  const { shareSlug } = useParams<{ shareSlug: string }>();
  const [searchParams] = useSearchParams();
  const [playlist, setPlaylist] = useState<any | null>(null);
  const [ownerName, setOwnerName] = useState('Unknown');
  const [loading, setLoading] = useState(true);
  const embed = searchParams.get('embed') === '1';

  useEffect(() => {
    if (!shareSlug) return;

    let active = true;

    const loadPlaylist = async () => {
      setLoading(true);
      setOwnerName('Unknown');

      try {
        const response = await fetch(`/api/public/playlists/${encodeURIComponent(shareSlug)}`);
        const data = await response.json();
        const nextPlaylist = data?.data ?? null;

        if (!active) return;
        setPlaylist(nextPlaylist);

        if (!nextPlaylist) return;

        const ownerFromPayload = resolveOwnerFromPayload(nextPlaylist);
        if (ownerFromPayload) {
          setOwnerName(ownerFromPayload);
          return;
        }

        const ownerId = extractOwnerId(nextPlaylist);
        if (!ownerId) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, username')
          .eq('user_id', ownerId)
          .maybeSingle();

        if (!active) return;

        const ownerFromProfile =
          normalizeOwnerName(profile?.display_name) ||
          normalizeOwnerName(profile?.username);

        if (ownerFromProfile) {
          setOwnerName(ownerFromProfile);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadPlaylist();

    return () => {
      active = false;
    };
  }, [shareSlug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!playlist) return <div className="min-h-screen flex items-center justify-center">Playlist not found</div>;

  const { name, share_description, playlist_items = [] } = playlist;

  const shareUrl = `${window.location.origin}/p/${shareSlug}`;
  const embedCode = `<iframe src="${shareUrl}?embed=1" width="600" height="400" frameborder="0" scrolling="no"></iframe>`;

  return (
    <div className={embed ? 'bg-transparent p-4' : 'min-h-screen bg-background text-foreground p-6'}>
      <div className={embed ? 'max-w-full' : 'max-w-4xl mx-auto'}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            <p className="text-sm text-muted-foreground">By {ownerName}</p>
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
