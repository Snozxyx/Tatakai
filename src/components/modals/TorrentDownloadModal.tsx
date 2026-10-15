import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
import { isP2PDisabled } from '@/lib/torrent/p2pPolicy';

interface TorrentDownloadModalProps {
  open: boolean;
  onClose: () => void;
  downloadPath?: string;
}

export function TorrentDownloadModal({ open, onClose, downloadPath }: TorrentDownloadModalProps) {
  useUiTranslation();
  const navigate = useNavigate();
  const [magnetInput, setMagnetInput] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async (magnet: string, infoHash?: string, label?: string) => {
    const runtime = (window as any).tatakaiRuntime;
    if (!runtime?.startTorrentSession) { toast.error(uiI18n.t('app.torrent_session_is_not_available_70d16cf7')); return; }
    if (isP2PDisabled()) {
      toast.error(uiI18n.t('app.p2p_torrents_are_disabled_in_settings_re_enable__8345c18c'));
      return;
    }
    const sessionKey = infoHash || magnet.slice(0, 40);
    setStarting(sessionKey); setError(null);
    try {
      const result = await runtime.startTorrentSession(infoHash || magnet, {
        magnet,
        downloadPath: typeof downloadPath === 'string' ? downloadPath : undefined,
      });
      if (result?.success || result?.sessionId) {
        const sessionId = result.sessionId || result.id;
        toast.success(uiI18n.t('app.torrent_startedi18n_value_0_81519d8d', { value0: label ? `: ${label}` : '' }));
        onClose();
        if (sessionId) {
          navigate(`/watch/${encodeURIComponent(`torrent-${infoHash || 'session'}?ep=1`)}?sessionId=${encodeURIComponent(sessionId)}`);
        }
      } else {
        throw new Error(result?.error || 'Failed to start torrent');
      }
    } catch (err: any) {
      setError(err?.message || uiI18n.t('app.failed_to_start_torrent_c2605118'));
    } finally {
      setStarting(null);
    }
  }, [downloadPath, navigate, onClose]);

  const handleStartMagnet = useCallback(async () => {
    const magnet = magnetInput.trim();
    if (!magnet) { setError(uiI18n.t('app.please_paste_a_magnet_link_23f8cc09')); return; }
    if (!magnet.startsWith('magnet:?')) { setError(uiI18n.t('app.invalid_magnet_link_must_start_with_magnet_779edc06')); return; }
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
            {uiI18n.t('app.torrent_download_49d25b51')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {uiI18n.t('app.paste_a_magnet_link_to_start_downloading_e264331f')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.paste_a_magnet_link_5f5b7ba5')}</label>
            <textarea value={magnetInput} onChange={e => { setMagnetInput(e.target.value); setError(null); }}
              placeholder={uiI18n.t('app.magnet_xt_urn_btih_85fb9918')} rows={5}
              className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm font-mono resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none transition-all" />
          </div>
          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>}
          <Button onClick={handleStartMagnet} disabled={!!starting || !magnetInput.trim()} className="w-full gap-2 h-11">
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Magnet className="w-4 h-4" />}
            {starting ? 'Starting...' : uiI18n.t('app.start_download_from_magnet_293c4319')}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {uiI18n.t('app.files_will_download_to_your_tatakai_library_fold_5f1a134b')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
