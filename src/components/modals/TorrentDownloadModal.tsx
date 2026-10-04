/**
 * TorrentDownloadModal.tsx
 *
 * Lets the user start a torrent download from a magnet link they supply.
 * The app does not search or index torrents — the magnet is the user's own
 * bring-your-own source; the engine is a content-neutral transport.
 */
import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Magnet, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TorrentDownloadModalProps {
  open: boolean;
  onClose: () => void;
  downloadPath?: string;
}

export function TorrentDownloadModal({ open, onClose, downloadPath }: TorrentDownloadModalProps) {
  const navigate = useNavigate();
  const [magnetInput, setMagnetInput] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setMagnetInput(''); setError(null); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl bg-background border border-white/10 shadow-2xl max-h-[92dvh] sm:max-h-[85vh] flex flex-col overflow-y-auto overscroll-contain rounded-3xl sm:rounded-2xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Magnet className="w-5 h-5 text-primary" />
            Torrent Download
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Paste a magnet link to start downloading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
