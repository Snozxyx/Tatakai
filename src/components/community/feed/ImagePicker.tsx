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
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image must be 8MB or smaller');
      return;
    }
    setUploading(true);
    try {
      const picked = await uploadFile(file);
      uploads.refetch();
      choose(picked);
    } catch (err) {
      toast.error('Upload failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = () => {
    const value = urlValue.trim();
    if (!value) return;
    if (!isAllowedImageUrl(value)) {
      toast.error('That link is not allowed', {
        description: `Only https links from well-known image hosts (${ALLOWED_IMAGE_HOSTS_HINT}) can be added.`,
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
      toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-3">
        {/* Add by URL */}
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Add by link
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
              Add
            </Button>
          </div>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground/70">
            Well-known image hosts only ({ALLOWED_IMAGE_HOSTS_HINT}).
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
          {uploading ? 'Uploading…' : 'Upload a new image'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {/* Previous uploads */}
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Images className="h-3.5 w-3.5" /> Your uploads
        </p>
        <ScrollArea className="h-44 pr-2">
          {!userId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sign in to see your uploads.</p>
          ) : uploads.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (uploads.data?.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No uploads yet.</p>
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
                    aria-label="Delete upload"
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
