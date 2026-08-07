/**
 * TorrentDownloadModal.tsx
 *
 * Allows users to search Nyaa.si for a torrent or paste a magnet link directly,
 * and start a torrent download session from the Downloads page.
 */
import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Magnet, Search, Download, Loader2, Users, HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TorrentCandidate {
  title: string;
  magnet: string;
  infoHash: string;
  seeders: number;
  leechers: number;
  size?: string;
  isTrusted: boolean;
  qualityBadge?: string;
  displayTitle?: string;
}

interface TorrentDownloadModalProps {
  open: boolean;
  onClose: () => void;
  downloadPath?: string;
}

export function TorrentDownloadModal({ open, onClose, downloadPath }: TorrentDownloadModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [episode, setEpisode] = useState('');
  const [magnetInput, setMagnetInput] = useState('');
  const [candidates, setCandidates] = useState<TorrentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.searchTorrentCandidates) { setError('Torrent search is not available.'); return; }
    setLoading(true); setError(null); setCandidates([]);
    try {
      const ep = episode.trim() ? Number(episode) : undefined;
      const result = await runtime.searchTorrentCandidates({ query: query.trim(), episode: ep });
      const list: TorrentCandidate[] = Array.isArray(result?.candidates) ? result.candidates
        : Array.isArray(result) ? result : [];
      if (list.length === 0) setError('No results found. Try a different search term.');
      setCandidates(list);
    } catch (err: any) {
      setError(err?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, episode]);

  const startSession = useCallback(async (magnet: string, infoHash?: string, label?: string) => {
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.startTorrentSession) { toast.error('Torrent session is not available.'); return; }
    const sessionKey = infoHash || magnet.slice(0, 40);
    setStarting(sessionKey); setError(null);
    try {
      const result = await runtime.startTorrentSession(infoHash || magnet, {
        magnet,
        downloadPath: typeof downloadPath === 'string' ? downloadPath : undefined,
      });
      if (result?.success || result?.sessionId) {
        const sessionId = result.sessionId || result.id;
        toast.success(`Torrent started${label ? `: ${label}` : ''}`);
        onClose();
        if (sessionId) {
          navigate(`/watch/${encodeURIComponent(`torrent-${infoHash || 'session'}?ep=1`)}?sessionId=${encodeURIComponent(sessionId)}`);
        }
      } else {
        throw new Error(result?.error || 'Failed to start torrent');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start torrent');
    } finally {
      setStarting(null);
    }
  }, [downloadPath, navigate, onClose]);

  const handleStartMagnet = useCallback(async () => {
    const magnet = magnetInput.trim();
    if (!magnet) { setError('Please paste a magnet link.'); return; }
    if (!magnet.startsWith('magnet:?')) { setError('Invalid magnet link. Must start with magnet:?'); return; }
    setError(null);
    const match = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
    await startSession(magnet, match?.[1] || '', 'Magnet download');
  }, [magnetInput, startSession]);

  const handleClose = () => {
    setQuery(''); setEpisode(''); setMagnetInput('');
    setCandidates([]); setError(null); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl bg-background border border-white/10 shadow-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Magnet className="w-5 h-5 text-primary" />
            Torrent Download
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Search Nyaa.si or paste a magnet link to start downloading.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="search" className="flex-1 flex flex-col overflow-hidden mt-2">
          <TabsList className="bg-white/5 border border-white/10 rounded-xl p-1 w-full">
            <TabsTrigger value="search" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
              <Search className="w-4 h-4" /> Search
            </TabsTrigger>
            <TabsTrigger value="magnet" className="flex-1 gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
              <Magnet className="w-4 h-4" /> Magnet Link
            </TabsTrigger>
          </TabsList>

          {/* Search tab */}
          <TabsContent value="search" className="flex-1 flex flex-col overflow-hidden space-y-3 mt-3">
            <div className="flex gap-2">
              <Input placeholder="Anime name (e.g. Berserk)" value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 h-10 bg-white/5 border-white/10" />
              <Input placeholder="Ep #" value={episode} type="number" min="1"
                onChange={e => setEpisode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-20 h-10 bg-white/5 border-white/10" />
              <Button onClick={handleSearch} disabled={loading || !query.trim()} className="gap-2 h-10">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Search
              </Button>
            </div>

            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>}

            {candidates.length > 0 && (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {candidates.map((c, i) => (
                  <div key={c.infoHash || i} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.isTrusted && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-400/15 text-yellow-400 border border-yellow-400/20">TRUSTED</span>}
                        {c.qualityBadge && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">{c.qualityBadge}</span>}
                      </div>
                      <p className="text-sm font-medium leading-tight line-clamp-2">{c.displayTitle || c.title}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">{c.seeders ?? '—'}</span> / <span className="text-yellow-400">{c.leechers ?? '—'}</span>
                        </span>
                        {c.size && <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{c.size}</span>}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => startSession(c.magnet, c.infoHash, c.displayTitle || c.title)} disabled={!!starting} className="flex-shrink-0 gap-1.5 h-9">
                      {starting === c.infoHash ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {starting === c.infoHash ? 'Starting...' : 'Download'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {!loading && candidates.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Magnet className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Search for an anime to find torrents.</p>
              </div>
            )}
          </TabsContent>

          {/* Magnet link tab */}
          <TabsContent value="magnet" className="space-y-4 mt-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Paste a magnet link</label>
              <textarea value={magnetInput} onChange={e => { setMagnetInput(e.target.value); setError(null); }}
                placeholder="magnet:?xt=urn:btih:..." rows={5}
                className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm font-mono resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all" />
            </div>
            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>}
            <Button onClick={handleStartMagnet} disabled={!!starting || !magnetInput.trim()} className="w-full gap-2 h-11">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Magnet className="w-4 h-4" />}
              {starting ? 'Starting...' : 'Start Download from Magnet'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Files will download to your Tatakai library folder.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
