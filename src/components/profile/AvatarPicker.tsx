import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useRandomProfileImages, 
  useRandomBannerImages, 
  useUpdateProfileAvatar, 
  useUpdateProfileBanner,
  useAniListCharacterSearch 
} from '@/hooks/user/useProfileFeatures';
import { Loader2, RefreshCw, Check, ImageIcon, Sparkles, User, Users, Search, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/components/ui/GlassPanel';

interface AvatarPickerProps {
  type: 'avatar' | 'banner';
  trigger: React.ReactNode;
  currentImage?: string;
}

export function AvatarPicker({ type, trigger, currentImage }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'any' | 'male' | 'female'>('any');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'gallery' | 'search'>('gallery');
  
  const { 
    data: profileImages, 
    isLoading: loadingProfile, 
    refetch: refetchProfile 
  } = useRandomProfileImages(12, genderFilter);
  
  const { 
    data: bannerImages, 
    isLoading: loadingBanner, 
    refetch: refetchBanner 
  } = useRandomBannerImages(8);

  const {
    data: searchResults,
    isLoading: loadingSearch
  } = useAniListCharacterSearch(searchQuery, activeTab === 'search');
  
  const updateAvatar = useUpdateProfileAvatar();
  const updateBanner = useUpdateProfileBanner();
  
  const galleryImages = type === 'avatar' ? profileImages : bannerImages;
  const isGalleryLoading = type === 'avatar' ? loadingProfile : loadingBanner;
  const refetchGallery = type === 'avatar' ? refetchProfile : refetchBanner;
  const updateMutation = type === 'avatar' ? updateAvatar : updateBanner;

  const safeUiText = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || fallback;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return (
        safeUiText(record.full) ||
        safeUiText(record.romaji) ||
        safeUiText(record.english) ||
        safeUiText(record.native) ||
        safeUiText(record.name) ||
        fallback
      );
    }
    return fallback;
  };

  const handleSelect = async () => {
    if (!selectedImage) return;
    
    try {
      await updateMutation.mutateAsync(selectedImage);
      toast.success(`${type === 'avatar' ? 'Avatar' : 'Banner'} updated!`);
      setOpen(false);
      setSelectedImage(null);
    } catch (error) {
      toast.error(`Failed to update ${type}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl bg-background/95 backdrop-blur-3xl border-border/50 p-0 overflow-hidden rounded-[2rem]">
        <div className="p-8 space-y-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-black tracking-tight">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="w-6 h-6" />
              </div>
              Choose {type === 'avatar' ? 'Identity' : 'Cover'}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-14 bg-white/5 rounded-2xl p-1 border border-white/5">
              <TabsTrigger value="gallery" className="rounded-xl font-bold text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Random Gallery
              </TabsTrigger>
              <TabsTrigger value="search" className="rounded-xl font-bold text-sm flex items-center gap-2">
                <Search className="w-4 h-4" />
                Character Search
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gallery" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {type === 'avatar' && (
                <div className="flex gap-2">
                  {(['any', 'male', 'female'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setGenderFilter(g)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border",
                        genderFilter === g 
                          ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20" 
                          : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchGallery()}
                    disabled={isGalleryLoading}
                    className="rounded-xl hover:bg-white/5"
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isGalleryLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              )}
              
              {isGalleryLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 py-12">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className={cn(
                  "grid gap-4",
                  type === 'avatar' ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2"
                )}>
                  {galleryImages?.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImage(img.url)}
                      className={cn(
                        "group relative overflow-hidden rounded-2xl border-2 transition-all duration-300",
                        type === 'avatar' ? "aspect-square" : "aspect-[21/9]",
                        selectedImage === img.url 
                          ? "border-primary ring-4 ring-primary/20 scale-95" 
                          : "border-transparent hover:border-primary/40 hover:scale-105"
                      )}
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                      {selectedImage === img.url && (
                        <div className="absolute inset-0 bg-primary/30 backdrop-blur-[2px] flex items-center justify-center">
                          <Check className="w-8 h-8 text-white drop-shadow-2xl" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="search" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search for an anime character (e.g. Gojo Satoru)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 pl-12 bg-white/5 border-white/10 rounded-2xl text-lg focus:ring-4 focus:ring-primary/10 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {loadingSearch ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
                  ))
                ) : searchResults?.map((char) => {
                  const imageUrl = safeUiText(char.image?.large || char.image?.medium, '/placeholder.svg');
                  const characterName = safeUiText(char.name?.full || char.name, 'Unknown Character');
                  const mediaTitle = safeUiText(char.media?.nodes?.[0]?.title?.romaji || char.media?.nodes?.[0]?.title);

                  return (
                  <button
                    key={char.id}
                    onClick={() => setSelectedImage(imageUrl)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-white/5 text-left h-48",
                      selectedImage === imageUrl
                        ? "border-primary ring-4 ring-primary/20"
                        : "border-transparent hover:border-primary/40"
                    )}
                  >
                    <img
                      src={imageUrl}
                      alt={characterName}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4 flex flex-col justify-end">
                      <p className="font-bold text-xs truncate leading-none mb-1 text-white">{characterName}</p>
                      <p className="text-[10px] text-white/60 font-medium truncate italic">
                        {mediaTitle}
                      </p>
                    </div>
                    {selectedImage === imageUrl && (
                      <div className="absolute inset-0 bg-primary/30 backdrop-blur-[2px] flex items-center justify-center">
                        <Check className="w-8 h-8 text-white drop-shadow-2xl" />
                      </div>
                    )}
                  </button>
                );
                })}
              </div>

              {searchQuery.length > 0 && !loadingSearch && (!searchResults || searchResults.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <Info className="w-10 h-10 mb-3 opacity-20" />
                  <p className="font-bold text-sm">No characters found for "{searchQuery}"</p>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-xl h-12 px-6 font-bold">
              Cancel
            </Button>
            <Button 
              onClick={handleSelect} 
              disabled={!selectedImage || updateMutation.isPending}
              className="rounded-xl h-12 px-8 font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Apply Transformation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
