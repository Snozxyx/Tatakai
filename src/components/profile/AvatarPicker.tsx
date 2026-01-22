import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRandomProfileImages, useRandomBannerImages, useUpdateProfileAvatar, useUpdateProfileBanner } from '@/hooks/useProfileFeatures';
import { Loader2, RefreshCw, Check, ImageIcon, Sparkles, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AvatarPickerProps {
  type: 'avatar' | 'banner';
  trigger: React.ReactNode;
  currentImage?: string;
}

export function AvatarPicker({ type, trigger, currentImage }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'any' | 'male' | 'female'>('any');
  
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
  
  const updateAvatar = useUpdateProfileAvatar();
  const updateBanner = useUpdateProfileBanner();
  
  const images = type === 'avatar' ? profileImages : bannerImages;
  const isLoading = type === 'avatar' ? loadingProfile : loadingBanner;
  const refetch = type === 'avatar' ? refetchProfile : refetchBanner;
  const updateMutation = type === 'avatar' ? updateAvatar : updateBanner;

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
      <DialogContent className="sm:max-w-2xl bg-background/95 backdrop-blur-xl border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Choose {type === 'avatar' ? 'Profile Picture' : 'Banner'} from Anime Gallery
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {type === 'avatar' && (
            <Tabs value={genderFilter} onValueChange={(v) => setGenderFilter(v as 'any' | 'male' | 'female')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="any" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  All
                </TabsTrigger>
                <TabsTrigger value="male" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Male
                </TabsTrigger>
                <TabsTrigger value="female" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Female
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Select an anime-style image
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className={cn(
              "grid gap-3",
              type === 'avatar' ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2"
            )}>
              {images?.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(img.url)}
                  className={cn(
                    "relative overflow-hidden rounded-lg border-2 transition-all duration-200",
                    type === 'avatar' ? "aspect-square" : "aspect-[21/9]",
                    selectedImage === img.url 
                      ? "border-primary ring-2 ring-primary/50 scale-95" 
                      : "border-transparent hover:border-primary/50 hover:scale-[0.98]"
                  )}
                >
                  <img
                    src={img.url}
                    alt="Anime image"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedImage === img.url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="w-6 h-6 text-white drop-shadow-lg" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {images?.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mb-2" />
              <p>No images found. Try refreshing.</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSelect} 
              disabled={!selectedImage || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Apply {type === 'avatar' ? 'Avatar' : 'Banner'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
