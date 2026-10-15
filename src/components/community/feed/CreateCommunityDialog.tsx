import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { uploadUserMedia } from '@/lib/userMedia';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateCommunity } from '@/hooks/community/useCommunities';
import { cn } from '@/lib/utils';

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function CreateCommunityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useUiTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const createCommunity = useCreateCommunity();
  const iconRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<{ file: File; preview: string } | null>(null);
  const [banner, setBanner] = useState<{ file: File; preview: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setNameAndSlug = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>, set: (v: { file: File; preview: string } | null) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error(uiI18n.t('app.image_must_be_under_5mb_5b768c5f'));
    const reader = new FileReader();
    reader.onloadend = () => set({ file, preview: reader.result as string });
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again if removed
    e.target.value = '';
  };

  const upload = async (file: File, _kind: string): Promise<string> => {
    const { url } = await uploadUserMedia(file, user!.id, 'forum_image');
    return url;
  };

  const submit = async () => {
    if (!name.trim() || !slug.trim()) return toast.error(uiI18n.t('app.name_and_slug_are_required_723fc5c6'));
    setSubmitting(true);
    try {
      const icon_url = icon ? await upload(icon.file, 'icon') : undefined;
      const banner_url = banner ? await upload(banner.file, 'banner') : undefined;
      const created = await createCommunity.mutateAsync({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined, icon_url, banner_url });
      toast.success(uiI18n.t('app.community_created_805d84f7'));
      onOpenChange(false);
      setName(''); setSlug(''); setSlugEdited(false); setDescription(''); setIcon(null); setBanner(null);
      navigate(`/community/c/${created.slug}`);
    } catch (err) {
      toast.error(uiI18n.t('app.failed_to_create_community_9eec0e1e'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden sm:rounded-2xl border-white/[0.08] bg-background">
        
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-xl">{uiI18n.t('app.create_a_community_a6a52fcc')}</DialogTitle>
            <DialogDescription>
              {uiI18n.t('app.give_your_new_space_a_name_an_icon_and_a_purpose_b1a4dbc1')}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Media Upload Area */}
        <div className="relative px-6 mb-10">
          {/* Banner */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => bannerRef.current?.click()}
            className="group relative flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-colors hover:bg-white/[0.04]"
          >
            {banner ? (
              <>
                <img src={banner.preview} alt={uiI18n.t('app.banner_preview_abf9f4a4')} className="h-full w-full object-cover" />
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setBanner(null); }}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-md transition-transform hover:scale-110 hover:bg-rose-500/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <ImagePlus className="h-6 w-6 opacity-50" />
                {uiI18n.t('app.add_banner_b5b47e59')}
              </span>
            )}
            
            {/* Banner Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </div>

          {/* Icon */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => iconRef.current?.click()}
            className="group absolute -bottom-8 left-10 z-10 flex h-[72px] w-[72px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-muted/80 shadow-sm transition-transform hover:scale-105"
          >
            {icon ? (
              <>
                <img src={icon.preview} alt={uiI18n.t('app.icon_preview_655ecdf1')} className="h-full w-full object-cover" />
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setIcon(null); }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white backdrop-blur-md transition-colors hover:bg-rose-500/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <Camera className="h-6 w-6 text-muted-foreground" />
            )}
            
            {/* Icon Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-5 px-6 pb-2">
          
          {/* Name Field */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground/90">{uiI18n.t('app.community_name_8121fc7b')} <span className="text-rose-500">*</span></label>
            <Input 
              value={name} 
              onChange={(e) => setNameAndSlug(e.target.value)} 
              placeholder={uiI18n.t('app.e_g_anime_enthusiasts_3750a9c0')}
              maxLength={60} 
              className="rounded-xl border-white/10 bg-white/[0.02] px-3.5 focus-visible:border-primary/50 focus-visible:bg-white/[0.04]" 
            />
          </div>

          {/* Slug Field */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground/90">{uiI18n.t('app.url_slug_1e05ce61')} <span className="text-rose-500">*</span></label>
            <div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] px-3.5 transition-colors focus-within:border-primary/50 focus-within:bg-white/[0.04]">
              <span className="select-none text-sm text-muted-foreground/70">/community/c/</span>
              <input 
                value={slug} 
                onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }} 
                placeholder={uiI18n.t('app.slug_name_079325c5')}
                className="flex-1 bg-transparent py-2.5 pl-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/50" 
              />
            </div>
          </div>

          {/* Description Field */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground/90 flex justify-between">
              {uiI18n.t('app.description_55f8ebc8')}
              <span className="font-normal text-muted-foreground">{description.length}/300</span>
            </label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder={uiI18n.t('app.what_is_this_community_about_8667087d')}
              rows={3} 
              maxLength={300} 
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.04]" 
            />
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.05] bg-white/[0.01] p-4 px-6 mt-2">
          <Button variant="ghost" className="rounded-full px-5 hover:bg-white/5" onClick={() => onOpenChange(false)}>
            {uiI18n.t('app.cancel_77dfd213')}
          </Button>
          <Button 
            className="rounded-full px-6 font-bold shadow-md transition-transform active:scale-95" 
            disabled={submitting || !name.trim() || !slug.trim()} 
            onClick={submit}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? 'Creating...' : uiI18n.t('app.create_community_6cd5b58f')}
          </Button>
        </div>

        <input ref={iconRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, setIcon)} />
        <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, setBanner)} />
      </DialogContent>
    </Dialog>
  );
}