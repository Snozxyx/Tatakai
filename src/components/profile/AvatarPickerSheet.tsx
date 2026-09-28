import { useState, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useRandomProfileImages,
  useRandomBannerImages,
  useUpdateProfileAvatar,
  useUpdateProfileBanner,
  useAniListCharacterSearch,
  useRandomAvatarGifs,
  useAniListMediaSearch,
  useWaifuLandscapeBanners,
} from '@/hooks/user/useProfileFeatures';
import { Loader2, RefreshCw, Check, ImageIcon, Sparkles, Search, Info, Upload, Link2, Clapperboard, Film, Images } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface AvatarPickerSheetProps {
  type: 'avatar' | 'banner';
  trigger: React.ReactNode;
  currentImage?: string;
}

export function AvatarPickerSheet({ type, trigger, currentImage }: AvatarPickerSheetProps) {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'any' | 'male' | 'female'>('any');
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerQuery, setBannerQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'gallery' | 'gif' | 'search' | 'anilist' | 'landscape' | 'upload'>('gallery');
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profileImages, isLoading: loadingProfile, refetch: refetchProfile } = useRandomProfileImages(12, genderFilter);
  const { data: bannerImages, isLoading: loadingBanner, refetch: refetchBanner } = useRandomBannerImages(8);
  const { data: searchResults, isLoading: loadingSearch } = useAniListCharacterSearch(searchQuery, activeTab === 'search');
  const { data: gifImages, isLoading: loadingGifs, refetch: refetchGifs } = useRandomAvatarGifs(12);
  const { data: mediaResults, isLoading: loadingMedia } = useAniListMediaSearch(bannerQuery, 'ANIME', activeTab === 'anilist');
  const { data: landscapeImages, isLoading: loadingLandscape, refetch: refetchLandscape } = useWaifuLandscapeBanners(8);

  const updateAvatar = useUpdateProfileAvatar();
  const updateBanner = useUpdateProfileBanner();

  const galleryImages = type === 'avatar' ? profileImages : bannerImages;
  const isGalleryLoading = type === 'avatar' ? loadingProfile : loadingBanner;
  const refetchGallery = type === 'avatar' ? refetchProfile : refetchBanner;
  const updateMutation = type === 'avatar' ? updateAvatar : updateBanner;

  const previewImage = selectedImage || currentImage;

  const safeUiText = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') return value.trim() || fallback;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value && typeof value === 'object') {
      const r = value as Record<string, unknown>;
      return safeUiText(r.full) || safeUiText(r.romaji) || safeUiText(r.english) || safeUiText(r.native) || safeUiText(r.name) || fallback;
    }
    return fallback;
  };

  const handleUpload = async (file: File) => {
    if (!user) { toast.error('Sign in first'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Image must be 8MB or smaller'); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${type === 'avatar' ? 'avatars' : 'banners'}/${user.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setSelectedImage(data.publicUrl);
      toast.success('Uploaded — press Apply to save');
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSelect = async () => {
    if (!selectedImage) return;
    try {
      await updateMutation.mutateAsync(selectedImage);
      toast.success(`${type === 'avatar' ? 'Avatar' : 'Banner'} updated!`);
      setOpen(false);
      setSelectedImage(null);
    } catch {
      toast.error(`Failed to update ${type}`);
    }
  };

  const selectAnim = reduceMotion
    ? {}
    : { scale: [1, 1.05, 1], transition: { duration: 0.4, ease: "easeOut" } };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/[0.08] bg-background/60 p-0 backdrop-blur-[40px] sm:max-w-md md:max-w-lg shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
      >
        {/* ── Ambient Background Glow ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          {previewImage ? (
            <img src={previewImage} alt="" className="w-full h-1/2 object-cover opacity-20 blur-[100px] saturate-[2]" />
          ) : (
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 blur-[120px] rounded-full" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background/95" />
        </div>

        {/* ── Header ── */}
        <SheetHeader className="relative shrink-0 border-b border-white/[0.05] bg-white/[0.01] p-6 pb-5 text-left z-10">
          <SheetTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white drop-shadow-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]">
              <Sparkles className="h-5 w-5" />
            </div>
            Choose {type === 'avatar' ? 'Identity' : 'Cover'}
          </SheetTitle>
        </SheetHeader>

        {/* ── Scrollable Body ── */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar relative z-10">
          
          {/* Live Preview Card */}
          <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
            
            {type === 'avatar' ? (
              <div className="flex items-center gap-5 relative z-10">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-background ring-[6px] ring-background/50 border border-white/10 shadow-2xl backdrop-blur-md">
                  <div className="h-full w-full bg-black/40">
                    {previewImage ? (
                      <img src={previewImage} alt="preview" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/50"><ImageIcon className="h-8 w-8" /></div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col">
                  <h4 className="text-sm font-bold text-white mb-1">Avatar Preview</h4>
                  <p className="text-xs font-medium text-muted-foreground/80 leading-relaxed">
                    {selectedImage ? 'Looking good! Press Apply to save your new identity.' : 'Pick from gallery, search, or upload a custom image.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative z-10">
                <div className="aspect-[21/9] w-full overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10 shadow-2xl">
                  {previewImage ? (
                    <img src={previewImage} alt="preview" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/50"><ImageIcon className="h-8 w-8" /></div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <h4 className="text-sm font-bold text-white mb-0.5">Banner Preview</h4>
                  <p className="text-xs font-medium text-muted-foreground/80">{selectedImage ? 'Ready to apply.' : 'Select a cinematic cover.'}</p>
                </div>
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid h-14 w-full grid-cols-4 rounded-full border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-xl backdrop-blur-md mb-6">
              <TabsTrigger value="gallery" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                <ImageIcon className="h-3.5 w-3.5" /> Gallery
              </TabsTrigger>
              {type === 'avatar' ? (
                <>
                  <TabsTrigger value="gif" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                    <Film className="h-3.5 w-3.5" /> GIF
                  </TabsTrigger>
                  <TabsTrigger value="search" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                    <Search className="h-3.5 w-3.5" /> Search
                  </TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="anilist" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                    <Clapperboard className="h-3.5 w-3.5" /> AniList
                  </TabsTrigger>
                  <TabsTrigger value="landscape" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                    <Images className="h-3.5 w-3.5" /> Art
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="upload" className="flex items-center gap-1.5 rounded-full text-[11px] sm:text-xs font-bold data-[state=active]:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                <Upload className="h-3.5 w-3.5" /> Upload
              </TabsTrigger>
            </TabsList>

            {/* ── Gallery Tab ── */}
            <TabsContent value="gallery" className="space-y-6 focus-visible:outline-none">
              {type === 'avatar' && (
                <div className="flex flex-wrap items-center gap-2">
                  {(['any', 'male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setGenderFilter(g)}
                      className={cn(
                        'rounded-full border px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all shadow-sm',
                        genderFilter === g
                          ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.4)]'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-white',
                      )}
                    >
                      {g}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => refetchGallery()} disabled={isGalleryLoading} className="rounded-full hover:bg-white/10 text-xs font-bold px-4">
                    <RefreshCw className={cn('mr-2 h-3.5 w-3.5', isGalleryLoading && 'animate-spin')} /> Refresh
                  </Button>
                </div>
              )}

              {isGalleryLoading ? (
                <div className="grid grid-cols-3 gap-4 py-2 sm:grid-cols-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="aspect-square animate-pulse rounded-2xl bg-white/[0.04] border border-white/[0.02]" />
                  ))}
                </div>
              ) : (
                <div className={cn('grid gap-4', type === 'avatar' ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2')}>
                  {galleryImages?.map((img) => {
                    const active = selectedImage === img.url;
                    return (
                      <motion.button
                        key={img.id}
                        onClick={() => setSelectedImage(img.url)}
                        animate={active ? selectAnim : {}}
                        whileHover={reduceMotion ? {} : { scale: 1.05 }}
                        whileTap={reduceMotion ? {} : { scale: 0.95 }}
                        className={cn(
                          'group relative overflow-hidden rounded-2xl transition-all duration-300 shadow-lg',
                          type === 'avatar' ? 'aspect-square' : 'aspect-[21/9]',
                          active 
                            ? 'ring-4 ring-primary shadow-[0_0_25px_rgba(var(--primary),0.5)] z-10' 
                            : 'ring-1 ring-white/10 hover:ring-primary/50 opacity-80 hover:opacity-100',
                        )}
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        <AnimatePresence>
                          {active && (
                            <motion.div
                              initial={reduceMotion ? false : { opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
                            >
                              <div className="bg-primary text-white rounded-full p-1.5 shadow-xl">
                                <Check className="h-5 w-5" />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── GIF Tab (avatar only) ── */}
            {type === 'avatar' && (
              <TabsContent value="gif" className="space-y-6 focus-visible:outline-none">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground/70">Animated anime reactions</p>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => refetchGifs()} disabled={loadingGifs} className="rounded-full hover:bg-white/10 text-xs font-bold px-4">
                    <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loadingGifs && 'animate-spin')} /> Shuffle
                  </Button>
                </div>
                {loadingGifs ? (
                  <div className="grid grid-cols-3 gap-4 py-2 sm:grid-cols-4">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="aspect-square animate-pulse rounded-2xl bg-white/[0.04] border border-white/[0.02]" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
                    {gifImages?.map((img) => {
                      const active = selectedImage === img.url;
                      return (
                        <motion.button
                          key={img.id}
                          onClick={() => setSelectedImage(img.url)}
                          animate={active ? selectAnim : {}}
                          whileHover={reduceMotion ? {} : { scale: 1.05 }}
                          whileTap={reduceMotion ? {} : { scale: 0.95 }}
                          title={img.animeName}
                          className={cn(
                            'group relative aspect-square overflow-hidden rounded-2xl transition-all duration-300 shadow-lg',
                            active
                              ? 'ring-4 ring-primary shadow-[0_0_25px_rgba(var(--primary),0.5)] z-10'
                              : 'ring-1 ring-white/10 hover:ring-primary/50 opacity-80 hover:opacity-100',
                          )}
                        >
                          <img src={img.url} alt={img.animeName || ''} className="h-full w-full object-cover" loading="lazy" />
                          {img.animeName && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5">
                              <p className="truncate text-[9px] font-semibold text-white/80">{img.animeName}</p>
                            </div>
                          )}
                          <AnimatePresence>
                            {active && (
                              <motion.div
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
                              >
                                <div className="bg-primary text-white rounded-full p-1.5 shadow-xl">
                                  <Check className="h-5 w-5" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            )}

            {/* ── AniList Title Banner Tab (banner only) ── */}
            {type === 'banner' && (
              <TabsContent value="anilist" className="space-y-6 focus-visible:outline-none">
                <div className="group relative shadow-lg rounded-full">
                  <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    placeholder="Search an anime (e.g. Jujutsu Kaisen)"
                    value={bannerQuery}
                    onChange={(e) => setBannerQuery(e.target.value)}
                    className="h-14 rounded-full border-white/[0.08] bg-white/[0.03] pl-14 text-sm font-medium transition-all focus:ring-2 focus:ring-primary/50 shadow-inner backdrop-blur-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {loadingMedia
                    ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[21/9] animate-pulse rounded-2xl bg-white/[0.04] border border-white/[0.02]" />)
                    : mediaResults?.map((img) => {
                        const active = selectedImage === img.url;
                        return (
                          <motion.button
                            key={img.id}
                            onClick={() => setSelectedImage(img.url)}
                            animate={active ? selectAnim : {}}
                            whileHover={reduceMotion ? {} : { scale: 1.03 }}
                            whileTap={reduceMotion ? {} : { scale: 0.97 }}
                            className={cn(
                              'group relative aspect-[21/9] overflow-hidden rounded-2xl text-left transition-all duration-300 shadow-lg',
                              active
                                ? 'ring-4 ring-primary shadow-[0_0_25px_rgba(var(--primary),0.5)] z-10'
                                : 'ring-1 ring-white/10 hover:ring-primary/50 opacity-90 hover:opacity-100',
                            )}
                          >
                            <img src={img.url} alt={img.animeName || ''} className="h-full w-full object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3 flex items-end">
                              <p className="truncate text-xs font-bold text-white drop-shadow-md">{img.animeName}</p>
                            </div>
                            <AnimatePresence>
                              {active && (
                                <motion.div
                                  initial={reduceMotion ? false : { opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
                                >
                                  <div className="bg-primary text-white rounded-full p-1.5 shadow-xl">
                                    <Check className="h-5 w-5" />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        );
                      })}
                </div>
                {bannerQuery.length > 1 && !loadingMedia && (!mediaResults || mediaResults.length === 0) && (
                  <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] py-12 text-muted-foreground backdrop-blur-sm">
                    <Info className="mb-3 h-10 w-10 opacity-20" />
                    <p className="text-sm font-bold">No banners found for "{bannerQuery}"</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Not every title has a banner image.</p>
                  </div>
                )}
              </TabsContent>
            )}

            {/* ── Landscape Art Tab (banner only) ── */}
            {type === 'banner' && (
              <TabsContent value="landscape" className="space-y-6 focus-visible:outline-none">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground/70">Decorative wide art</p>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => refetchLandscape()} disabled={loadingLandscape} className="rounded-full hover:bg-white/10 text-xs font-bold px-4">
                    <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loadingLandscape && 'animate-spin')} /> Refresh
                  </Button>
                </div>
                {loadingLandscape ? (
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="aspect-[21/9] animate-pulse rounded-2xl bg-white/[0.04] border border-white/[0.02]" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {landscapeImages?.map((img) => {
                      const active = selectedImage === img.url;
                      return (
                        <motion.button
                          key={img.id}
                          onClick={() => setSelectedImage(img.url)}
                          animate={active ? selectAnim : {}}
                          whileHover={reduceMotion ? {} : { scale: 1.03 }}
                          whileTap={reduceMotion ? {} : { scale: 0.97 }}
                          className={cn(
                            'group relative aspect-[21/9] overflow-hidden rounded-2xl transition-all duration-300 shadow-lg',
                            active
                              ? 'ring-4 ring-primary shadow-[0_0_25px_rgba(var(--primary),0.5)] z-10'
                              : 'ring-1 ring-white/10 hover:ring-primary/50 opacity-80 hover:opacity-100',
                          )}
                        >
                          <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                          <AnimatePresence>
                            {active && (
                              <motion.div
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
                              >
                                <div className="bg-primary text-white rounded-full p-1.5 shadow-xl">
                                  <Check className="h-5 w-5" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            )}

            {/* ── Character Search Tab ── */}
            <TabsContent value="search" className="space-y-6 focus-visible:outline-none">
              <div className="group relative shadow-lg rounded-full">
                <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  placeholder="Search a character (e.g. Gojo Satoru)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 rounded-full border-white/[0.08] bg-white/[0.03] pl-14 text-sm font-medium transition-all focus:ring-2 focus:ring-primary/50 shadow-inner backdrop-blur-md"
                />
              </div>

              <div className="custom-scrollbar grid grid-cols-2 gap-4 sm:grid-cols-3 pb-2">
                {loadingSearch
                  ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 animate-pulse rounded-[1.5rem] bg-white/[0.04] border border-white/[0.02]" />)
                  : searchResults?.map((char) => {
                      const imageUrl = safeUiText(char.image?.large || char.image?.medium, '/placeholder.svg');
                      const characterName = safeUiText(char.name?.full || char.name, 'Unknown Character');
                      const mediaTitle = safeUiText(char.media?.nodes?.[0]?.title?.romaji || char.media?.nodes?.[0]?.title);
                      const active = selectedImage === imageUrl;
                      return (
                        <motion.button
                          key={char.id}
                          onClick={() => setSelectedImage(imageUrl)}
                          animate={active ? selectAnim : {}}
                          whileHover={reduceMotion ? {} : { scale: 1.04 }}
                          whileTap={reduceMotion ? {} : { scale: 0.96 }}
                          className={cn(
                            'group relative h-48 overflow-hidden rounded-[1.5rem] text-left transition-all duration-300 shadow-lg',
                            active 
                              ? 'ring-4 ring-primary shadow-[0_0_25px_rgba(var(--primary),0.5)] z-10' 
                              : 'ring-1 ring-white/10 hover:ring-primary/50 opacity-90 hover:opacity-100',
                          )}
                        >
                          <img src={imageUrl} alt={characterName} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent p-4 flex flex-col justify-end">
                            <p className="mb-1 truncate text-xs font-bold leading-none text-white drop-shadow-md">{characterName}</p>
                            <p className="truncate text-[10px] font-medium text-white/60 drop-shadow-md">{mediaTitle}</p>
                          </div>
                          <AnimatePresence>
                            {active && (
                              <motion.div
                                initial={reduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
                              >
                                <div className="bg-primary text-white rounded-full p-1.5 shadow-xl">
                                  <Check className="h-5 w-5" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
              </div>

              {searchQuery.length > 0 && !loadingSearch && (!searchResults || searchResults.length === 0) && (
                <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] py-16 text-muted-foreground backdrop-blur-sm">
                  <Info className="mb-4 h-12 w-12 opacity-20" />
                  <p className="text-sm font-bold">No characters found for "{searchQuery}"</p>
                </div>
              )}
            </TabsContent>

            {/* ── Upload Tab ── */}
            <TabsContent value="upload" className="space-y-6 focus-visible:outline-none">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-4 rounded-[2rem] border-2 border-dashed border-white/[0.15] bg-white/[0.02] py-16 transition-all hover:border-primary/50 hover:bg-white/[0.04] shadow-inner group"
              >
                {uploading ? (
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors shadow-lg">
                    <Upload className="h-7 w-7" />
                  </div>
                )}
                <div className="text-center">
                  <p className="font-bold text-sm text-foreground/90 mb-1">Click to upload image</p>
                  <p className="text-xs font-medium text-muted-foreground/60">PNG, JPG, WebP · Up to 8MB</p>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleUpload(f);
                }}
              />

              <div className="flex items-center gap-4 px-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">or paste url</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              <form
                className="flex gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const url = urlInput.trim();
                  if (!/^https?:\/\//i.test(url)) { toast.error('Enter a valid image URL'); return; }
                  setSelectedImage(url);
                  toast.success('Loaded — press Apply to save');
                }}
              >
                <div className="relative flex-1 shadow-lg rounded-full">
                  <Link2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="https://.../image.png"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="h-12 rounded-full border-white/10 bg-white/[0.03] pl-11 text-sm focus:ring-2 focus:ring-primary/40 backdrop-blur-md"
                  />
                </div>
                <Button type="submit" variant="secondary" className="rounded-full h-12 px-6 font-bold shadow-lg bg-white/10 hover:bg-white/20 border border-white/10">
                  Use URL
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Sticky Footer ── */}
        <div className="relative z-20 flex shrink-0 justify-end gap-3 border-t border-white/[0.08] bg-background/60 p-5 backdrop-blur-2xl">
          <Button variant="ghost" onClick={() => setOpen(false)} className="h-12 rounded-full px-6 font-bold hover:bg-white/10">
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedImage || updateMutation.isPending}
            className="h-12 rounded-full px-8 text-sm font-black uppercase tracking-widest shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all hover:scale-105"
          >
            {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}