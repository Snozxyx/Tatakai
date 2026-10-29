import { supabase } from '@/integrations/supabase/client';
import { GalleryAttachmentPicker } from './GalleryAttachmentPicker';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { uploadUserMedia, deleteUserMedia } from '@/lib/userMedia';
import { validateProfileImage } from '@/lib/profileMedia';
import { useStorageUsage } from '@/hooks/user/useStorageUsage';
import { StorageUsageBar } from '@/components/media/StorageUsageBar';
import { useLightbox } from '@/components/media/ImageLightbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';

export function useProfileGallery(userId: string) {
  return useQuery({ queryKey:['profile-gallery',userId], enabled:!!userId, staleTime:30_000, queryFn:async () => {
    const [uploads,chosen] = await Promise.all([
      supabase.storage.from('user-media').list(`${userId}/gallery`,{limit:100,sortBy:{column:'created_at',order:'desc'}}),
      supabase.from('profile_gallery_attachments' as never).select('bucket,path').eq('user_id',userId),
    ]);
    if(uploads.error)throw uploads.error;
    if(chosen.error&&!['42P01','PGRST205'].includes(chosen.error.code))throw chosen.error;
    const files=[...(uploads.data??[]).filter(f=>f.id).map(f=>({bucket:'user-media',path:`${userId}/gallery/${f.name}`,category:'gallery'})),...((chosen.data??[]) as unknown as {bucket:string;path:string}[]).map(f=>({...f,category:'attachment'}))];
    return files.map(f=>({...f,url:supabase.storage.from(f.bucket).getPublicUrl(f.path).data.publicUrl}));
  } });
}
export function ProfileGallery({ userId, isOwner, preview = false }: { userId: string; isOwner: boolean; preview?: boolean }) {
  const { user } = useAuth(); const canManage = isOwner && user?.id === userId;
  const query = useProfileGallery(userId); const cache = useQueryClient(); const storage = useStorageUsage();
  const lightbox = useLightbox(); const confirm = useConfirm(); const fileInput = useRef<HTMLInputElement>(null);
  const [busy,setBusy] = useState(false); const [removing,setRemoving] = useState<string | null>(null);
  const files = preview ? query.data?.slice(0,3) : query.data;
  const refresh = async () => { await Promise.all([cache.invalidateQueries({queryKey:['profile-gallery',userId]}),cache.invalidateQueries({queryKey:['user-media',userId]}),cache.invalidateQueries({queryKey:['storage-usage',userId]})]); };
  return <div className={`rw-gallery ${preview ? 'rw-gallery-preview' : ''}`}>
    {!preview && canManage && <div className="rw-gallery-manage"><StorageUsageBar /><div className="flex flex-wrap items-center gap-3"><Button size="sm" disabled={busy || !!removing} onClick={() => fileInput.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}Add photos</Button><GalleryAttachmentPicker userId={userId} selected={(query.data??[]).filter(f=>f.category==='attachment')} onSaved={refresh}/><p className="text-xs text-muted-foreground">Only photos you upload or choose appear here · uses your shared storage allowance</p></div>
      <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={async event => {
        const selected = Array.from(event.target.files ?? []); event.target.value = ''; if (!selected.length || !user) return;
        setBusy(true);
        try {
          for(const file of selected) validateProfileImage(file);
          if ((query.data?.filter(f => f.category === 'gallery').length || 0) + selected.length > 100) throw new Error('Your gallery can contain up to 100 photos. Remove a photo before adding more.');
          // The server also checks and serializes the same shared quota; this check only avoids wasted transfers.
          if(storage.data && storage.data.usedBytes + selected.reduce((n,f) => n+f.size,0) > storage.data.quotaBytes) throw new Error('These photos exceed your remaining shared storage. Remove some saved media or choose smaller images.');
          for(const file of selected) await uploadUserMedia(file,user.id,'gallery');
          toast.success('Gallery updated');
        } catch(error) { toast.error(error instanceof Error ? error.message : 'Photo upload failed. Please retry.'); }
        finally { setBusy(false); await refresh(); }
      }} />
    </div>}
    {query.isLoading ? <p role="status" className="rw-empty">Loading gallery…</p> : query.isError ? <div><p role="alert" className="rw-empty">The gallery could not load.</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button></div> : files?.length ? <div className="rw-photo-grid">{files.map((file,index) => <figure key={`${file.bucket}:${file.path}`}>
      <button type="button" className="rw-photo-open" onClick={() => lightbox.open((query.data ?? []).map(photo => ({ url:photo.url,alt:'Profile gallery photo' })),index)} aria-label={`Open gallery photo ${index+1}`}><img src={file.url} alt={`Gallery photo ${index+1}`} loading="lazy" decoding="async" /></button>
      {!preview && canManage && file.category === 'gallery' && <Button type="button" size="icon" variant="destructive" className="rw-photo-remove" aria-label={`Delete gallery photo ${index+1}`} disabled={busy || !!removing} onClick={async () => {
        if(!await confirm({title:'Delete this gallery photo?',description:'This removes the uploaded file and releases its shared storage space. Any links to the photo will stop working.',confirmLabel:'Delete photo',destructive:true})) return;
        setRemoving(file.path);try {await deleteUserMedia(file);await refresh();}catch{toast.error('The photo could not be deleted. Please retry.');}finally{setRemoving(null);}
      }}>{removing === file.path ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>}
    </figure>)}</div> : <div className="rw-gallery-empty"><ImagePlus size={24} /><p>{canManage ? 'Your gallery is ready for your photos.' : 'No public gallery photos yet.'}</p></div>}
  </div>;
}
