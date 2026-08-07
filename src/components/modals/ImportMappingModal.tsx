import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { contentGraph } from '@/core';
import { 
  FolderOpen, Search, Copy, Move, Check, Info, Loader2, Sparkles, Edit2
} from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedImportItem {
  originalPath: string;
  fileName: string;
  parsedTitle: string;
  parsedEpisode: number | null;
  parsedSeason: number | null;
  parsedGroup: string | null;
  parsedSource?: string | null;
  parsedQuality?: string | null;
}

interface ParsedImportGroup {
  groupKey: string;
  displayTitle: string;
  totalFiles: number;
  files: ParsedImportItem[];
}

interface ImportMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPaths: string[];
  onImportComplete: () => void;
}

interface MappingItem extends ParsedImportGroup {
  targetAnimeName: string;
  seasonNumber: number;
  releaseGroup: string;
  primaryEpisode: number;
}

export function ImportMappingModal({
  isOpen,
  onClose,
  initialPaths,
  onImportComplete,
}: ImportMappingModalProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [items, setItems] = useState<MappingItem[]>([]);
  const [importMode, setImportMode] = useState<'copy' | 'move'>('copy');

  // Bulk edit state
  const [bulkQuery, setBulkQuery] = useState('');
  const [bulkSearchResults, setBulkSearchResults] = useState<any[]>([]);
  const [searchingBulk, setSearchingBulk] = useState(false);
  const [selectedBulkAnime, setSelectedBulkAnime] = useState<any | null>(null);
  const [bulkSeason, setBulkSeason] = useState<number>(1);

  // Individual search state
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [indivQuery, setIndivQuery] = useState('');
  const [indivSearchResults, setIndivSearchResults] = useState<any[]>([]);
  const [searchingIndiv, setSearchingIndiv] = useState(false);

  useEffect(() => {
    if (isOpen && initialPaths.length > 0) {
      void analyzePaths();
    }
  }, [isOpen, initialPaths]);

  const analyzePaths = async () => {
    setAnalyzing(true);
    setItems([]);
    try {
      const res = await (window as any).electron.analyzeImportPaths(initialPaths);
      if (res.success && Array.isArray(res.items)) {
        const mapped: MappingItem[] = res.items.map((item: ParsedImportGroup) => {
          const firstFile = item.files[0];
          const firstEpisode = item.files.find((file) => file.parsedEpisode != null)?.parsedEpisode ?? 1;
          return {
            ...item,
            targetAnimeName: firstFile?.parsedTitle || item.displayTitle,
            primaryEpisode: firstEpisode,
            seasonNumber: firstFile?.parsedSeason !== null && firstFile?.parsedSeason !== undefined ? firstFile.parsedSeason : 1,
            releaseGroup: firstFile?.parsedGroup || '',
          };
        });
        setItems(mapped);
        
        // Auto-fill bulk query with the first parsed title if available
        const firstTitle = mapped.find(i => i.targetAnimeName)?.targetAnimeName;
        if (firstTitle) {
          setBulkQuery(firstTitle);
          void searchBulkAnime(firstTitle);
        }
      } else {
        toast.error(res.error || 'Failed to parse import files');
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Error analyzing files');
      onClose();
    } finally {
      setAnalyzing(false);
    }
  };

  const searchBulkAnime = async (query: string) => {
    if (!query.trim()) return;
    setSearchingBulk(true);
    try {
      const res = await contentGraph.search({ query, page: 1, perPage: 6 });
      setBulkSearchResults(res?.media || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingBulk(false);
    }
  };

  const handleBulkSearchChange = (val: string) => {
    setBulkQuery(val);
    const delayDebounce = setTimeout(() => {
      void searchBulkAnime(val);
    }, 500);
    return () => clearTimeout(delayDebounce);
  };

  const applyBulkAnime = (anime: any) => {
    setSelectedBulkAnime(anime);
    const officialTitle = anime.titleEnglish || anime.titleRomaji || anime.titleNative;
    
    setItems(prev => prev.map(item => ({
      ...item,
      targetAnimeName: officialTitle,
      seasonNumber: bulkSeason
    })));
    toast.success(`Applied "${officialTitle}" to all files!`);
    setBulkSearchResults([]);
  };

  const handleBulkSeasonChange = (season: number) => {
    setBulkSeason(season);
    setItems(prev => prev.map(item => ({
      ...item,
      seasonNumber: season
    })));
  };

  // Individual Item Editing
  const updateItemField = (index: number, field: keyof MappingItem, value: any) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Individual Search
  const startIndividualSearch = (index: number, currentTitle: string) => {
    setActiveSearchIndex(index);
    setIndivQuery(currentTitle);
    void searchIndividualAnime(currentTitle);
  };

  const searchIndividualAnime = async (query: string) => {
    if (!query.trim()) return;
    setSearchingIndiv(true);
    try {
      const res = await contentGraph.search({ query, page: 1, perPage: 5 });
      setIndivSearchResults(res?.media || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingIndiv(false);
    }
  };

  const handleIndivSearchChange = (val: string) => {
    setIndivQuery(val);
    const delayDebounce = setTimeout(() => {
      void searchIndividualAnime(val);
    }, 500);
    return () => clearTimeout(delayDebounce);
  };

  const selectIndividualAnime = (index: number, anime: any) => {
    const title = anime.titleEnglish || anime.titleRomaji || anime.titleNative;
    updateItemField(index, 'targetAnimeName', title);
    setActiveSearchIndex(null);
    setIndivSearchResults([]);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const customPath = localStorage.getItem('tatakai_download_path') || undefined;
      const res = await (window as any).electron.finalizeImport({
        items: items.map(item => ({
          originalPath: item.files[0]?.originalPath,
          targetAnimeName: item.targetAnimeName,
          episodeNumber: item.primaryEpisode,
          seasonNumber: item.seasonNumber,
          releaseGroup: item.releaseGroup || undefined,
          files: item.files.map((file, index) => ({
            originalPath: file.originalPath,
            episodeNumber: file.parsedEpisode ?? item.primaryEpisode + index,
            seasonNumber: file.parsedSeason ?? item.seasonNumber,
            releaseGroup: file.parsedGroup || item.releaseGroup || undefined,
            source: file.parsedSource || undefined,
            quality: file.parsedQuality || undefined,
          })),
        })),
        mode: importMode,
        customPath
      });

      if (res.success) {
        toast.success(res.message || 'Import successful!');
        onImportComplete();
        onClose();
      } else {
        toast.error(res.error || 'Failed to finalize import');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Error importing videos');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !importing && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden bg-background text-foreground">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold font-display">
            <FolderOpen className="w-6 h-6 text-primary" />
            Media Import & Metadata Mapping
          </DialogTitle>
          <DialogDescription>
            Map your local files to canonical AniList anime metadata before importing them into Tatakai's local library.
          </DialogDescription>
        </DialogHeader>

        {analyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm font-medium">Analyzing video files and extracting metadata...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 py-2">
            
            {/* Bulk Apply Bar */}
            <GlassPanel className="p-4 bg-white/5 border-white/10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex-1 space-y-1.5 w-full">
                <Label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Bulk Match Series
                </Label>
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search AniList to match all files to a single show..."
                    value={bulkQuery}
                    onChange={(e) => handleBulkSearchChange(e.target.value)}
                    className="pl-9 bg-black/20"
                  />
                  {bulkSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                      {bulkSearchResults.map(anime => (
                        <button
                          key={anime.anilistId}
                          type="button"
                          onClick={() => applyBulkAnime(anime)}
                          className="w-full px-4 py-2.5 text-left text-xs md:text-sm hover:bg-white/5 border-b border-white/5 last:border-0 flex gap-3 items-center text-foreground"
                        >
                          {anime.coverImageMedium && (
                            <img src={anime.coverImageMedium} className="w-8 h-10 object-cover rounded" />
                          )}
                          <div>
                            <p className="font-semibold line-clamp-1">{anime.titleEnglish || anime.titleRomaji}</p>
                            <p className="text-[10px] text-muted-foreground">{anime.format} • {anime.seasonYear || 'N/A'}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full md:w-32 space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Bulk Season</Label>
                <Input
                  type="number"
                  min={1}
                  value={bulkSeason}
                  onChange={(e) => handleBulkSeasonChange(parseInt(e.target.value) || 1)}
                  className="bg-black/20"
                />
              </div>
            </GlassPanel>

            {/* List of files */}
            <div className="flex-1 min-h-0 border border-white/10 rounded-xl overflow-hidden bg-black/10">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="relative p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">
                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-mono block truncate" title={item.displayTitle}>
                          {item.displayTitle}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{item.totalFiles} file(s)</span>
                          {item.releaseGroup ? <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">{item.releaseGroup}</span> : null}
                          {item.seasonNumber ? <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">Season {item.seasonNumber}</span> : null}
                        </div>
                        
                        {/* Title Match/Search */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {activeSearchIndex === idx ? (
                            <div className="relative flex-1">
                              <Input
                                value={indivQuery}
                                onChange={(e) => handleIndivSearchChange(e.target.value)}
                                className="h-8 text-xs pr-8"
                                autoFocus
                              />
                              {indivSearchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                                  {indivSearchResults.map(anime => (
                                    <button
                                      key={anime.anilistId}
                                      type="button"
                                      onClick={() => selectIndividualAnime(idx, anime)}
                                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 border-b border-white/5 last:border-0 text-foreground"
                                    >
                                      {anime.titleEnglish || anime.titleRomaji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-sm font-semibold truncate text-primary-foreground">
                                {item.targetAnimeName}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-5 h-5 opacity-50 hover:opacity-100"
                                onClick={() => startIndividualSearch(idx, item.targetAnimeName)}
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          {item.files.slice(0, 4).map((file) => (
                            <span key={file.originalPath} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                              {file.fileName}
                            </span>
                          ))}
                          {item.files.length > 4 ? <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">+{item.files.length - 4} more</span> : null}
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex flex-col space-y-1 w-20">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Season</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.seasonNumber}
                            onChange={(e) => updateItemField(idx, 'seasonNumber', parseInt(e.target.value) || 1)}
                            className="h-8 text-xs text-center"
                          />
                        </div>
                        <div className="flex flex-col space-y-1 w-20">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Episode</span>
                          <Input
                            type="number"
                            min={1}
                            value={item.primaryEpisode}
                            onChange={(e) => updateItemField(idx, 'primaryEpisode', parseInt(e.target.value) || 1)}
                            className="h-8 text-xs text-center"
                          />
                        </div>
                        <div className="flex flex-col space-y-1 w-32 flex-1 md:flex-initial">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">Group/Version</span>
                          <Input
                            placeholder="e.g. Erai-raws"
                            value={item.releaseGroup}
                            onChange={(e) => updateItemField(idx, 'releaseGroup', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Import options */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground font-semibold uppercase">Import Mode:</span>
                <div className="flex border border-white/10 rounded-lg p-0.5 bg-black/20">
                  <Button
                    variant={importMode === 'copy' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs rounded-md gap-1"
                    onClick={() => setImportMode('copy')}
                  >
                    <Copy className="w-3 h-3" />
                    Copy Files (Safe)
                  </Button>
                  <Button
                    variant={importMode === 'move' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs rounded-md gap-1"
                    onClick={() => setImportMode('move')}
                  >
                    <Move className="w-3.5 h-3.5" />
                    Move Files (Saves Disk)
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                <span>Files will be organized and manifests created automatically.</span>
              </div>
            </div>

          </div>
        )}

        <DialogFooter className="border-t border-white/10 pt-4 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={importing || items.length === 0 || analyzing}
            className="gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirm Import ({items.length} Files)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
