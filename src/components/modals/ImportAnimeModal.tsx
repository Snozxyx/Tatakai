/**
 * ImportAnimeModal.tsx
 *
 * Multi-step modal for importing local video files with:
 * - Optional anime association via AniList search (downloads poster automatically)
 * - Per-file episode number fields
 * - Multi-file selection support
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Search, FileVideo, CheckCircle2, Loader2, ArrowLeft, SkipForward, Hash } from 'lucide-react';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

// ── AniList Search ──────────────────────────────────────────────────────────

interface AniListMedia {
  id: number;
  title: { romaji?: string; english?: string };
  coverImage: { large?: string };
}

async function searchAniList(query: string): Promise<AniListMedia[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($q:String){Page(perPage:8){media(search:$q,type:ANIME){id title{romaji english}coverImage{large}}}}`,
        variables: { q: query.trim() },
      }),
    });
    const json = await res.json();
    return json?.data?.Page?.media || [];
  } catch {
    return [];
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface FileEntry {
  originalPath: string;
  fileName: string;
  episodeNumber: number;
}

interface ImportAnimeModalProps {
  open: boolean;
  filePaths: string[];
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'episodes' | 'search' | 'importing' | 'done';

// ── Component ───────────────────────────────────────────────────────────────

export function ImportAnimeModal({ open, filePaths, onClose, onSuccess }: ImportAnimeModalProps) {
  const [step, setStep] = useState<Step>('episodes');
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AniListMedia[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<AniListMedia | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize file entries with auto-detected episode numbers
  useEffect(() => {
    if (open && filePaths.length > 0) {
      setStep('episodes');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedAnime(null);
      setImportError(null);

      const entries: FileEntry[] = filePaths.map((fp, i) => {
        const fileName = fp.split(/[\\/]/).pop() || fp;
        // Try to detect episode number from filename
        const epMatch = fileName.match(/[Ee](?:pisode\s*)?(\d+)|[\s_\-](\d{2,3})[\s_\-\[\.]/);
        const detectedEp = epMatch
          ? parseInt(epMatch[1] || epMatch[2], 10)
          : i + 1;
        return { originalPath: fp, fileName, episodeNumber: detectedEp };
      });
      setFileEntries(entries);
    }
  }, [open, filePaths]);

  // Debounced AniList search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchAniList(searchQuery);
      setSearchResults(results);
      setSearchLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const handleEpisodeNumberChange = (index: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setFileEntries(prev => prev.map((e, i) => i === index ? { ...e, episodeNumber: num } : e));
  };

  const handleImport = useCallback(async (animeName: string, anime?: AniListMedia | null) => {
    setStep('importing');
    setImportError(null);
    try {
      const electron = (window as any).electron;
      if (!electron?.finalizeImport) throw new Error('Import not available');

      const posterUrl = anime?.coverImage?.large || null;

      const items = [{
        targetAnimeName: animeName,
        displayTitle: animeName,
        posterUrl,
        files: fileEntries.map(entry => ({
          originalPath: entry.originalPath,
          episodeNumber: entry.episodeNumber,
          seasonNumber: 1,
        })),
      }];

      const result = await electron.finalizeImport({
        items,
        mode: 'copy',
        customPath: null,
        posterUrl,
      });

      if (result?.success) {
        setStep('done');
        const posterMsg = posterUrl ? ' (poster downloaded)' : '';
        toast.success(result.message || `Imported ${fileEntries.length} file(s) to "${animeName}"${posterMsg}`);
        setTimeout(() => { onSuccess(); onClose(); }, 1500);
      } else {
        throw new Error(result?.error || 'Import failed');
      }
    } catch (err: any) {
      setImportError(err?.message || 'Import failed');
      setStep('search');
    }
  }, [fileEntries, onSuccess, onClose]);

  const handleSkip = () => handleImport('Imported Videos', null);

  const handleSelectAnime = (anime: AniListMedia) => {
    setSelectedAnime(anime);
    const name = anime.title.english || anime.title.romaji || 'Imported Videos';
    handleImport(name, anime);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl bg-background border border-white/10 shadow-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileVideo className="w-5 h-5 text-primary" />
            Import Videos
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {step === 'episodes' && `${fileEntries.length} file(s) — set episode numbers then choose an anime.`}
            {step === 'search' && 'Search for the anime to organize your files.'}
            {step === 'importing' && 'Copying files to your library...'}
            {step === 'done' && 'Import complete!'}
          </DialogDescription>
        </DialogHeader>

        {/* Step: episode numbers */}
        {step === 'episodes' && (
          <div className="space-y-4 mt-2 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto max-h-72 space-y-2 rounded-xl bg-white/5 border border-white/10 p-3">
              {fileEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <FileVideo className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="flex-1 text-sm text-muted-foreground truncate min-w-0" title={entry.fileName}>
                    {entry.fileName}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      value={entry.episodeNumber}
                      onChange={e => handleEpisodeNumberChange(i, e.target.value)}
                      className="w-16 h-7 text-center text-sm bg-white/10 border-white/20 p-1"
                      title="Episode number"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground px-1">
              Set the episode number for each file, then choose an anime or skip.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setStep('search')} className="w-full gap-2 h-11">
                <Search className="w-4 h-4" />
                Search for Anime & Download Poster
              </Button>
              <Button variant="outline" onClick={handleSkip} className="w-full gap-2 h-11">
                <SkipForward className="w-4 h-4" />
                Skip — Import as "Imported Videos"
              </Button>
            </div>
          </div>
        )}

        {/* Step: anime search */}
        {step === 'search' && (
          <div className="space-y-4 mt-2 flex flex-col overflow-hidden">
            {importError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {importError}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search anime name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-11 bg-white/5 border-white/10"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 max-h-64">
                {searchResults.map(anime => (
                  <button
                    key={anime.id}
                    onClick={() => handleSelectAnime(anime)}
                    className={cn(
                      'group flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition-all hover:bg-white/10 border border-transparent hover:border-white/20',
                      selectedAnime?.id === anime.id && 'border-primary/60 bg-primary/10'
                    )}
                  >
                    <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-white/5">
                      <img
                        src={getProxiedImageUrl(anime.coverImage?.large || '')}
                        alt={anime.title.english || anime.title.romaji}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={e => { (e.currentTarget as HTMLImageElement).src = '/placeholder.svg'; }}
                      />
                    </div>
                    <span className="text-[10px] text-center line-clamp-2 text-muted-foreground leading-tight">
                      {anime.title.english || anime.title.romaji}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-auto">
              <Button variant="ghost" size="sm" onClick={() => setStep('episodes')} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button variant="outline" onClick={handleSkip} className="flex-1 gap-2 h-10">
                <SkipForward className="w-4 h-4" />
                Skip — Import as "Imported Videos"
              </Button>
            </div>
          </div>
        )}

        {/* Step: importing */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Copying {fileEntries.length} file(s) and downloading poster...</p>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
            <p className="font-medium">Import complete!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
