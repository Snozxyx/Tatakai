import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Magnet, Search, CheckCircle2, AlertCircle, 
  Loader2, Info, ArrowRight, Film, HelpCircle, FolderOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { upsertLocalTorrentSessionHistory } from '@/lib/localStorage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MagnetAlignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMagnet?: string;
  initialTorrentBuffer?: any;
}

const formatTorrentBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
};

export function MagnetAlignmentModal({ isOpen, onClose, initialMagnet, initialTorrentBuffer }: MagnetAlignmentModalProps) {
  const navigate = useNavigate();
  const torrentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [magnetLink, setMagnetLink] = useState(initialMagnet || '');
  const [torrentBuffer, setTorrentBuffer] = useState<any | null>(null);
  const [step, setStep] = useState(1);
  const [metadata, setMetadata] = useState<{
    name: string;
    hash: string;
    searchTitle?: string;
    confidence?: number;
    parsed?: {
      title?: string;
      searchTitle?: string;
      episodeNumber?: number;
      episodeEnd?: number;
      season?: number;
      isBatch?: boolean;
      source?: string;
      resolution?: string;
      codec?: string;
      releaseGroup?: string;
    };
  } | null>(null);
  const [selectedAnime, setSelectedAnime] = useState<any | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [manualEpisode, setManualEpisode] = useState<number | ''>('');
  const [confirmLowConfidence, setConfirmLowConfidence] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [torrentPreview, setTorrentPreview] = useState<any | null>(null);

  const episodeOptions: number[] = (() => {
    const values: number[] = [];

    for (const file of torrentPreview?.playableFiles || []) {
      const episodeNumber = typeof file?.episodeNumber === 'number' && Number.isFinite(file.episodeNumber)
        ? file.episodeNumber
        : null;

      if (episodeNumber != null && !values.includes(episodeNumber)) {
        values.push(episodeNumber);
      }
    }

    return values.sort((left, right) => left - right);
  })();

  const loadTorrentPreview = async (buffer: any, sourceLabel?: string) => {
    try {
      resetAlignmentState();
      const preview = await (window as any).tatakaiRuntime.previewTorrent(buffer);
      const previewName = String(preview?.name || sourceLabel || 'Unknown Torrent');
      const defaultEpisode = Array.isArray(preview?.detectedEpisodes) && preview.detectedEpisodes.length > 0
        ? preview.detectedEpisodes[0]
        : (preview?.files || []).find((file: any) => typeof file.episodeNumber === 'number')?.episodeNumber;

      setTorrentBuffer(buffer);
      setTorrentPreview(preview || null);
      setMetadata({
        name: previewName,
        hash: String(preview?.infoHash || previewName),
        searchTitle: previewName,
        confidence: preview?.success ? 100 : 0,
        parsed: {
          title: previewName,
          searchTitle: previewName,
          episodeNumber: defaultEpisode,
        },
      });
      setSelectedAnime(null);
      setManualSearch(previewName);
      setManualEpisode(defaultEpisode || '');
      setConfirmLowConfidence(false);
      setMagnetLink('');

      if (preview?.success || preview?.blocked || (preview?.files?.length || 0) > 0) {
        setStep(2);
      }

      if (preview?.success) {
        toast.success(`Loaded ${previewName}`);
      } else if (preview?.blocked || preview?.error) {
        toast.error(preview.error || 'This torrent cannot be played.');
      }
    } catch {
      toast.error('Failed to open torrent file');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMagnetLink(initialMagnet || '');
    setTorrentBuffer(null);
    setTorrentPreview(null);
    setMetadata(null);
    setSelectedAnime(null);
    setManualSearch('');
    setManualEpisode('');
    setConfirmLowConfidence(false);
    if (initialTorrentBuffer) {
      void loadTorrentPreview(initialTorrentBuffer);
      return;
    }
    setStep(initialMagnet ? 2 : 1);
    setResolving(false);
  }, [isOpen, initialMagnet, initialTorrentBuffer]);

  // Search for anime matches based on resolved name
  const searchQuery = (manualSearch || metadata?.searchTitle || metadata?.parsed?.title || metadata?.name || '').trim();
  const { data: matches, isLoading: searching } = useQuery({
    queryKey: ['anime_matches', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return [];
      // Clean up name for better search (remove group tags, file extensions, resolutions)
      const baseCleanName = searchQuery
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\.mkv|\.mp4|\.avi/g, '')
        .replace(/720p|1080p|2160p|4k|h264|h265|x264|x265|webrip|web-dl|bluray|bdrip|aac|ac3|flac|dual audio|multi/gi, '')
        .replace(/\bS\d{1,2}E\d{1,3}\b/gi, '')
        .replace(/\bepisode\s*\d+\b/gi, '')
        .trim();
      const aliases = baseCleanName
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean);
      const candidateQueries = Array.from(new Set([baseCleanName, ...aliases])).slice(0, 3);

      const runSearch = async (name: string) => {
        if (!name) return [];
        const res = await fetch(`https://graphql.anilist.co`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query ($search: String) {
                Page(perPage: 8) {
                  media(search: $search, type: ANIME) {
                    id
                    title { romaji english native }
                    coverImage { large }
                    format
                    episodes
                  }
                }
              }
            `,
            variables: { search: name }
          })
        });
        const json = await res.json();
        return json?.data?.Page?.media || [];
      };

      const allResults: any[] = [];
      for (const q of candidateQueries) {
        const rows = await runSearch(q);
        allResults.push(...rows);
        if (allResults.length >= 8) break;
      }
      const dedup = new Map<number, any>();
      for (const item of allResults) dedup.set(item.id, item);
      return Array.from(dedup.values());
    },
    enabled: !!searchQuery && step === 2
  });

  const resetAlignmentState = () => {
    setTorrentBuffer(null);
    setTorrentPreview(null);
    setMetadata(null);
    setSelectedAnime(null);
    setManualSearch('');
    setManualEpisode('');
    setConfirmLowConfidence(false);
    setStep(1);
  };

  const handleResolve = async () => {
    if (!magnetLink) return;
    setResolving(true);
    try {
      const result = await (window as any).tatakaiRuntime.resolveMagnetMetadata(magnetLink);
      if (result.success) {
        setTorrentBuffer(null);
        setTorrentPreview(null);
        setMetadata(result);
        setManualSearch(result?.searchTitle || result?.parsed?.title || result?.name || '');
        setManualEpisode(result?.parsed?.episodeNumber || '');
        setConfirmLowConfidence((result?.confidence || 0) < 60);
        setStep(2);
      } else {
        toast.error(result.error || 'Failed to resolve magnet metadata');
      }
    } catch (err) {
      toast.error('IPC Error resolving magnet');
    } finally {
      setResolving(false);
    }
  };

  const handleTorrentFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      await loadTorrentPreview(buffer, file.name);
    } catch {
      toast.error('Failed to open torrent file');
    }
  };

  const handleImport = async (asGeneric = false) => {
    if (!asGeneric && (!selectedAnime || !metadata)) return;
    if (asGeneric && !metadata) return;

    const resolvedEpisode = typeof manualEpisode === 'number' ? manualEpisode : metadata?.parsed?.episodeNumber;
    
    if (!asGeneric) {
      const totalEpisodes = Number(selectedAnime?.episodes || 0);
      if (resolvedEpisode && totalEpisodes > 0 && resolvedEpisode > totalEpisodes) {
        toast.error(`Episode ${resolvedEpisode} exceeds total episodes (${totalEpisodes}) for selected anime.`);
        return;
      }
      if ((metadata!.confidence || 0) < 60 && !confirmLowConfidence) {
        toast.error('Low confidence mapping. Confirm low-confidence mapping to continue.');
        return;
      }
    }
    
    const toastId = 'importing-magnet';
    try {
      toast.loading('Importing and aligning magnet...', { id: toastId });
      if (torrentBuffer && torrentPreview?.blocked) {
        toast.error(torrentPreview.error || 'This torrent cannot be played.', { id: toastId });
        return;
      }

      if (!torrentBuffer) {
        const existingSessionId = new URLSearchParams(window.location.search).get('sessionId');
        if (existingSessionId && (window as any).tatakaiRuntime?.getTorrentStreamUrl) {
          const existing = await (window as any).tatakaiRuntime.getTorrentStreamUrl(existingSessionId);
          if (existing?.success && existing.url) {
            toast.success('Torrent is already open.', { id: toastId });
            navigate(`/watch/torrent-${existingSessionId}?torrent=true&sessionId=${existingSessionId}`);
            onClose();
            return;
          }
        }
      }

      // Load torrent engine settings
      const maxConns = Number(localStorage.getItem('tatakai_torrent_max_conns') || 3);
      const enableUpnp = localStorage.getItem('tatakai_torrent_upnp') !== 'false';

      const startOptions = {
        magnet: torrentBuffer ? undefined : magnetLink || undefined,
        animeId: asGeneric ? `generic-${metadata!.hash}` : selectedAnime.id,
        animeTitle: asGeneric ? metadata!.name : selectedAnime.title.romaji,
        animeTotalEpisodes: asGeneric ? null : (selectedAnime.episodes || null),
        episodeNumber: resolvedEpisode || null,
        parsedRelease: metadata!.parsed || null,
        mappingConfidence: asGeneric ? 100 : (metadata!.confidence || 0),
        autoAlign: !asGeneric,
        // Engine settings
        maxConns,
        upnp: enableUpnp,
      };

      const result = torrentBuffer
        ? await (window as any).tatakaiRuntime.startTorrentFromFile(torrentBuffer, startOptions)
        : await (window as any).tatakaiRuntime.startTorrentSession(metadata!.hash, startOptions);

      const isPendingMetadata = !result.success && result?.retryable && (
        result.error === 'metadata_timeout' ||
        result.error === 'metadata_files_pending' ||
        result.error === 'metadata_pending'
      );

      if (result.success || (isPendingMetadata && result.sessionId)) {
        const sessionId = result.sessionId;
        const status = 'active';
        upsertLocalTorrentSessionHistory({
          sessionId,
          infoHash: metadata!.hash,
          torrentName: metadata!.name,
          animeId: asGeneric ? `generic-${metadata!.hash}` : selectedAnime.id,
          animeName: asGeneric ? metadata!.name : selectedAnime.title.romaji,
          episodeId: `torrent-${sessionId}`,
          episodeNumber: resolvedEpisode || 1,
          fileName: result.fileName || metadata!.parsed?.title || metadata!.name,
          fileIndex: result.fileIndex ?? 0,
          status,
          progress: 0,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        toast.success(
          isPendingMetadata
            ? 'Metadata is still resolving. Opening the torrent session...'
            : 'Magnet imported successfully!',
          { id: toastId }
        );
        
        // Navigate to watch page with torrent info
        if (asGeneric) {
           navigate(`/watch/torrent-${metadata!.hash}?torrent=true&sessionId=${sessionId}`);
        } else {
           // Standard watch page navigation
           // We might need to handle how the watch page detects this session
           navigate(`/watch/${selectedAnime.id}?ep=${resolvedEpisode || 1}&torrent=true&sessionId=${sessionId}`);
        }
        
        onClose();
      } else {  
        toast.error(result.error || 'Failed to start torrent', { id: toastId });
      }
    } catch (err) {
      toast.error('Failed to communicate with torrent core', { id: toastId });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl bg-background/95 backdrop-blur-3xl border-border/50 p-0 overflow-hidden rounded-[2rem] max-h-[90vh] flex flex-col">
        <DialogTitle className="sr-only">Import & Align Torrent</DialogTitle>
        <DialogDescription className="sr-only">Step {step} of 2: {step === 1 ? 'Source Input' : 'Anime Mapping'}</DialogDescription>
        
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-inner">
              <Magnet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Import & <span className="text-primary italic">Align</span></h2>
              <p className="text-xs text-muted-foreground font-medium">Step {step} of 2: {step === 1 ? 'Source Input' : 'Anime Mapping'}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/5">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Search className="w-4 h-4 text-primary" />
                    Magnet Link or .magnet File
                  </h3>
                  <div className="grid gap-4">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Paste Magnet Link</label>
                      <textarea 
                        placeholder="magnet:?xt=urn:btih:..." 
                        value={magnetLink}
                        onChange={e => {
                          resetAlignmentState();
                          setMagnetLink(e.target.value);
                        }}
                        className="w-full min-h-[120px] p-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:border-primary/50 transition-all text-xs font-mono leading-relaxed"
                      />
                    </div>
                    
                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
                      <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest"><span className="bg-card px-4 text-muted-foreground">OR</span></div>
                    </div>

                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 group"
                      onClick={async () => {
                        const path = await (window as any).electron.selectFile({
                          title: 'Select .magnet File',
                          filters: [{ name: 'Magnet Files', extensions: ['magnet'] }]
                        });
                        if (path) {
                          const res = await (window as any).tatakaiRuntime.importMagnetFile(path);
                          if (res.success) {
                            resetAlignmentState();
                            setMagnetLink(res.magnetLink);
                          }
                        }
                      }}
                    >
                      <Search className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                      Browse .magnet file
                    </Button>

                    <input
                      ref={torrentFileInputRef}
                      type="file"
                      accept=".torrent,application/x-bittorrent"
                      className="hidden"
                      onChange={handleTorrentFileSelected}
                    />

                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl border-dashed border-white/10 hover:border-primary/50 hover:bg-primary/5 group"
                      onClick={() => torrentFileInputRef.current?.click()}
                    >
                      <FolderOpen className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                      Browse .torrent file
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex gap-4">
                  <Info className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-200/70 leading-relaxed font-medium">
                    Importing a magnet will allow Tatakai to track and align its content with our internal library for seamless playback.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Film className="w-4 h-4 text-primary" />
                      Detected Metadata
                    </h3>
                    <div className="px-3 py-1 rounded-full bg-primary/10 text-[10px] font-black text-primary border border-primary/20">
                      CONFIDENCE: {(metadata?.confidence || 0) >= 75 ? 'HIGH' : (metadata?.confidence || 0) >= 60 ? 'MEDIUM' : 'LOW'}
                    </div>
                  </div>
                  
                  <GlassPanel className="p-4 border-white/5 bg-white/[0.02]">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Source Name</p>
                    <p className="text-sm font-medium line-clamp-2">{metadata?.name}</p>
                    <div className="mt-2 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                      {metadata?.parsed?.episodeNumber != null && <span>Episode: {metadata.parsed.episodeNumber}</span>}
                      {metadata?.parsed?.season != null && <span>Season: {metadata.parsed.season}</span>}
                      {metadata?.parsed?.resolution && <span>{metadata.parsed.resolution}</span>}
                      {metadata?.parsed?.source && <span>{metadata.parsed.source}</span>}
                      {metadata?.parsed?.codec && <span>{metadata.parsed.codec}</span>}
                    </div>
                  </GlassPanel>

                  {episodeOptions.length > 0 && (
                    <GlassPanel className="p-4 border-white/5 bg-white/[0.02] space-y-3">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Episode Setting</p>
                        <p className="text-sm text-muted-foreground">Choose the episode you want to start from for this pack.</p>
                      </div>
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px] items-end">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Detected Episodes</label>
                          <Select
                            value={String(manualEpisode || episodeOptions[0] || '')}
                            onValueChange={(value) => setManualEpisode(Number(value))}
                          >
                            <SelectTrigger className="h-11 bg-white/5 border-white/10 rounded-xl">
                              <SelectValue placeholder="Choose episode" />
                            </SelectTrigger>
                            <SelectContent>
                              {episodeOptions.map((episodeNumber) => (
                                <SelectItem key={episodeNumber} value={String(episodeNumber)}>
                                  Episode {episodeNumber}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Manual Override</label>
                          <Input
                            type="number"
                            value={manualEpisode}
                            onChange={(e) => setManualEpisode(e.target.value ? Number(e.target.value) : '')}
                            placeholder="Episode #"
                            className="h-11 bg-white/5 border-white/10 rounded-xl"
                          />
                        </div>
                      </div>
                    </GlassPanel>
                  )}

                  {torrentPreview && (
                    <GlassPanel className="p-4 border-white/5 bg-white/[0.02] space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Torrent Output</p>
                          <p className="text-sm font-semibold">{torrentPreview.selectedFile?.name || torrentPreview.name || 'No playable file detected'}</p>
                        </div>
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black border",
                          torrentPreview.blocked
                            ? "bg-red-500/10 text-red-300 border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                        )}>
                          {torrentPreview.blocked ? 'BLOCKED' : 'PLAYABLE'}
                        </div>
                      </div>

                      {torrentPreview.error && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-200">
                          {torrentPreview.error}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <div className="rounded-xl bg-white/5 px-3 py-2">Files: {torrentPreview.files?.length || 0}</div>
                        <div className="rounded-xl bg-white/5 px-3 py-2">Playable: {torrentPreview.playableFiles?.length || 0}</div>
                        {episodeOptions.length > 0 && (
                          <div className="col-span-2 rounded-xl bg-white/5 px-3 py-2">
                            Detected episodes: {episodeOptions.join(', ')}
                          </div>
                        )}
                        {torrentPreview.selectedFile && (
                          <div className="col-span-2 rounded-xl bg-white/5 px-3 py-2">
                            Selected: {torrentPreview.selectedFile.name} ({formatTorrentBytes(torrentPreview.selectedFile.size || torrentPreview.selectedFile.length || 0)})
                          </div>
                        )}
                      </div>

                      <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                        {(torrentPreview.files || []).map((file: any) => (
                          <div
                            key={`${file.index}-${file.name}`}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2",
                              torrentPreview.selectedFileIndex === file.index
                                ? "border-primary/30 bg-primary/10"
                                : "border-white/5 bg-white/[0.03]"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-[10px] text-muted-foreground">{formatTorrentBytes(file.size || 0)}</p>
                              {(file.episodeNumber != null || file.season != null) && (
                                <p className="text-[10px] text-muted-foreground">
                                  {file.season != null ? `Season ${file.season}` : 'Season ?'}
                                  {file.episodeNumber != null ? ` • Episode ${file.episodeNumber}` : ''}
                                  {file.episodeEnd != null ? `-${file.episodeEnd}` : ''}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-[10px] font-black border",
                                file.isVideo
                                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                  : "bg-red-500/10 text-red-300 border-red-500/20"
                              )}>
                                {file.isVideo ? 'Playable' : 'Unsupported'}
                              </span>
                              {torrentPreview.selectedFileIndex === file.index && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Will play</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassPanel>
                  )}

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Map to Anime</label>
                    <Input
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder="Search anime title manually..."
                      className="h-11 bg-white/5 border-white/10 rounded-xl"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {episodeOptions.length === 0 ? (
                        <Input
                          type="number"
                          value={manualEpisode}
                          onChange={(e) => setManualEpisode(e.target.value ? Number(e.target.value) : '')}
                          placeholder="Episode number (optional)"
                          className="h-11 bg-white/5 border-white/10 rounded-xl"
                        />
                      ) : (
                        <div className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 flex items-center text-xs text-muted-foreground">
                          Episode set above: {manualEpisode || episodeOptions[0] || 'auto'}
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                        <input
                          type="checkbox"
                          checked={confirmLowConfidence}
                          onChange={(e) => setConfirmLowConfidence(e.target.checked)}
                        />
                        Confirm low-confidence mapping
                      </label>
                    </div>
                    
                    {searching ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {matches?.map((anime: any) => (
                          <button
                            key={anime.id}
                            onClick={() => setSelectedAnime(anime)}
                            className={cn(
                              "flex items-center gap-4 p-3 rounded-2xl border transition-all text-left group",
                              selectedAnime?.id === anime.id 
                                ? "bg-primary/10 border-primary shadow-lg shadow-primary/10" 
                                : "bg-white/5 border-white/5 hover:border-white/20"
                            )}
                          >
                            <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0">
                              <img src={anime.coverImage.large} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className={cn(
                                "font-bold text-sm truncate",
                                selectedAnime?.id === anime.id ? "text-primary" : "text-foreground"
                              )}>
                                {anime.title.romaji}
                              </h4>
                              <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                                {anime.format} • {anime.episodes || '?'} Episodes
                              </p>
                            </div>
                            {selectedAnime?.id === anime.id && (
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            )}
                          </button>
                        ))}
                        
                        {!matches || matches.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                            <AlertCircle className="w-8 h-8 text-muted-foreground/30 mb-2" />
                            <p className="text-xs text-muted-foreground">No automatic matches found.</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Edit the search title above and pick the anime manually.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-white/5 bg-card flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <Button
              variant="ghost"
              onClick={step === 1 ? onClose : () => setStep(1)}
              className="rounded-2xl h-14 px-8 font-bold"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            
            {step === 2 && (
              <Button
                variant="outline"
                onClick={() => handleImport(true)}
                className="rounded-2xl h-14 px-8 font-bold border-white/10 hover:bg-white/5"
                disabled={Boolean(torrentBuffer && torrentPreview?.blocked)}
              >
                Watch Generic
              </Button>
            )}
          </div>

          <Button
            onClick={step === 1 ? handleResolve : () => handleImport(false)}
            disabled={resolving || (step === 1 && !magnetLink) || (step === 2 && !selectedAnime) || Boolean(torrentBuffer && torrentPreview?.blocked)}
            className="w-full md:w-auto rounded-2xl h-14 px-12 bg-primary text-primary-foreground shadow-xl shadow-primary/20 font-black italic tracking-tight"
          >
            {resolving ? (
              <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Resolving...</>
            ) : step === 1 ? (
              <><ArrowRight className="w-5 h-5 mr-3" /> Resolve Metadata</>
            ) : (
              <><CheckCircle2 className="w-5 h-5 mr-3" /> Align & Watch</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
