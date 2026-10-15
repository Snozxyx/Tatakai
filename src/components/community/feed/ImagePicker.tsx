import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Upload, Link2, Images, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/api';
import { listUserMedia, deleteUserMedia, type UserMediaFile } from '@/lib/userMedia';
import { isAllowedImageUrl, ALLOWED_IMAGE_HOSTS_HINT } from '@/lib/imageHosts';

export interface PickedImage {
  url: string;
  width?: number;
  height?: number;
}

/**
 * Smart image picker: pick from your previous uploads, upload a fresh file, or
 * paste a link from a well-known image host (allowlisted in `imageHosts.ts`).
 * `uploadFile` is injected so each surface stores into the right bucket/category
 * (post images vs. comment attachments) and can capture intrinsic dimensions.
 */
export function ImagePicker({
  trigger,
  userId,
  uploadFile,
  onSelect,
  disabled,
  align = 'start',
}: {
  trigger: React.ReactNode;
  userId: string | undefined;
  uploadFile: (file: File) => Promise<PickedImage>;
  onSelect: (image: PickedImage) => void;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
}) {
  useUiTranslation();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const uploads = useQuery({
    queryKey: ['user-media', userId],
    queryFn: () => listUserMedia(userId!),
    enabled: open && !!userId,
    staleTime: 30 * 1000,
  });

  const choose = (image: PickedImage) => {
    onSelect(image);
    setOpen(false);
    setUrlValue('');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(uiI18n.t('app.please_select_an_image_file_b1d184e9'));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(uiI18n.t('app.image_must_be_8mb_or_smaller_29e7edae'));
      return;
    }
    setUploading(true);
    try {
      const picked = await uploadFile(file);
      uploads.refetch();
      choose(picked);
    } catch (err) {
      toast.error(uiI18n.t('app.upload_failed_ad0d0603'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = () => {
    const value = urlValue.trim();
    if (!value) return;
    if (!isAllowedImageUrl(value)) {
      toast.error(uiI18n.t('app.that_link_is_not_allowed_b93f0bf8'), {
        get description() { return uiI18n.t('app.only_https_links_from_well_known_image_hosts_i18_5a649da4', { value0: ALLOWED_IMAGE_HOSTS_HINT }); },
      });
      return;
    }
    choose({ url: value });
  };

  const handleDelete = async (e: React.MouseEvent, file: UserMediaFile) => {
    e.stopPropagation();
    try {
      await deleteUserMedia(file);
      uploads.refetch();
    } catch (err) {
      toast.error(uiI18n.t('app.could_not_delete_c2cddf00'), { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-3">
        {/* Add by URL */}
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> {uiI18n.t('app.add_by_link_7913342d')}
          </p>
          <div className="flex gap-1.5">
            <Input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
              placeholder="https://i.imgur.com/…"
              className="h-9 text-sm"
            />
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={handleAddUrl} disabled={!urlValue.trim()}>
              {uiI18n.t('app.add_61cc55aa')}
            </Button>
          </div>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground/70">
            {uiI18n.t('app.well_known_image_hosts_only_1278e751')}{ALLOWED_IMAGE_HOSTS_HINT}).
          </p>
        </div>

        {/* Upload new */}
        <Button
          type="button"
          variant="outline"
          className="mb-3 h-9 w-full gap-2"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? uiI18n.t('app.uploading_d921a79a') : uiI18n.t('app.upload_a_new_image_6e99191c')}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {/* Previous uploads */}
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Images className="h-3.5 w-3.5" /> {uiI18n.t('app.your_uploads_a302557f')}
        </p>
        <ScrollArea className="h-44 pr-2">
          {!userId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{uiI18n.t('app.sign_in_to_see_your_uploads_b195357f')}</p>
          ) : uploads.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (uploads.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{uiI18n.t('app.no_uploads_yet_11da33e0')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {uploads.data!.map((file) => (
                <button
                  key={`${file.bucket}:${file.path}`}
                  type="button"
                  onClick={() => choose({ url: file.url })}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/[0.06] bg-muted/40 hover:border-primary/60"
                >
                  <img src={getProxiedImageUrl(file.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => handleDelete(e, file)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                    aria-label={uiI18n.t('app.delete_upload_fea8963a')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
