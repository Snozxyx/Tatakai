import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ImagePlus, Info, Loader2, Save, Trash2, Users } from 'lucide-react';
import { CommunitySidebar } from '@/components/community/feed/CommunitySidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/api';
import { uploadUserMedia } from '@/lib/userMedia';
import { useIsNativeApp, useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityBySlug, useUpdateCommunity, useDeleteCommunity } from '@/hooks/community/useCommunities';

type ImageState = { file?: File; preview: string } | null;

export default function CommunitySettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const { user, isAdmin, isModerator } = useAuth();
  const { data: community, isLoading } = useCommunityBySlug(slug);
  const updateCommunity = useUpdateCommunity();
  const deleteCommunity = useDeleteCommunity();

  const canManage =
    !!(user && community) &&
    (community.created_by === user.id ||
      community.my_role === 'owner' ||
      community.my_role === 'mod' ||
      isAdmin ||
      isModerator);

  // Deleting the whole community is stricter than managing it: only the
  // community owner, its creator, or a platform admin — never a mod.
  const canDelete =
    !!(user && community) &&
    (community.created_by === user.id || community.my_role === 'owner' || isAdmin);

  const iconRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ImageState>(null);
  const [banner, setBanner] = useState<ImageState>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!community) return;
    setName(community.name ?? '');
    setDescription(community.description ?? '');
    setIcon(community.icon_url ? { preview: getProxiedImageUrl(community.icon_url) } : null);
    setBanner(community.banner_url ? { preview: getProxiedImageUrl(community.banner_url) } : null);
  }, [community?.id]);

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>, set: (v: ImageState) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB');
    const reader = new FileReader();
    reader.onloadend = () => set({ file, preview: reader.result as string });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!community) return;
    if (!name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      // Only newly-picked files upload; untouched previews keep the stored URL.
      let icon_url = community.icon_url ?? undefined;
      let banner_url = community.banner_url ?? undefined;
      if (icon?.file) icon_url = (await uploadUserMedia(icon.file, user!.id, 'forum_image')).url;
      if (banner?.file) banner_url = (await uploadUserMedia(banner.file, user!.id, 'forum_image')).url;
      await updateCommunity.mutateAsync({
        id: community.id,
        name: name.trim(),
        description: description.trim(),
        icon_url,
        banner_url,
      });
      toast.success('Community updated');
      navigate(`/community/c/${community.slug}`);
    } catch (err) {
      toast.error('Failed to save', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!community) return;
    try {
      await deleteCommunity.mutateAsync(community.id);
      toast.success('Community deleted');
      navigate('/community');
    } catch (err) {
      toast.error('Failed to delete', { description: err instanceof Error ? err.message : undefined });
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community || !canManage) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <CommunitySidebar />
        <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : isNative ? 'pl-0' : 'pl-0 md:pl-24 lg:pl-28')}>
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <h1 className="font-display text-2xl font-bold">{community ? 'You can’t manage this community' : 'Community not found'}</h1>
            <Button className="mt-4 rounded-full" onClick={() => navigate(community ? `/community/c/${community.slug}` : '/community')}>
              {community ? 'Back to community' : 'Back to Community'}
            </Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <CommunitySidebar />

      {/* Ambient banner bleed behind the whole page */}
      {(banner?.preview || community.banner_url) && (
        <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
          <img
            src={banner?.preview || getProxiedImageUrl(community.banner_url!)}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.12] blur-[100px] saturate-[2.5] md:opacity-[0.2]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background/95" />
        </div>
      )}

      <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : isNative ? 'pl-0' : 'pl-0 md:pl-24 lg:pl-28')}>
        <div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-12">
          {/* Header row */}
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => navigate(`/community/c/${community.slug}`)}
              className="group/back flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Back to community"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover/back:-translate-x-0.5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary/80">Settings</p>
              <h1 className="truncate font-display text-2xl font-black tracking-tight">{community.name}</h1>
            </div>
            <Button size="sm" className="gap-1.5 rounded-full font-bold" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>

          {/* Banner + icon */}
          <div className="relative mb-8">
            <button
              type="button"
              onClick={() => bannerRef.current?.click()}
              className="community-card group/banner relative flex h-40 w-full items-center justify-center"
            >
              {banner ? (
                <img src={banner.preview} alt="" className="h-full w-full object-cover transition-transform group-hover/banner:scale-[1.02]" />
              ) : (
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><ImagePlus className="h-4 w-4" /> Add banner</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-semibold text-white opacity-0 transition-opacity group-hover/banner:opacity-100">
                Change banner
              </span>
            </button>
            <button
              type="button"
              onClick={() => iconRef.current?.click()}
              className="group/icon absolute -bottom-6 left-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-background shadow-xl"
            >
              {icon ? (
                <img src={icon.preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Users className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/icon:opacity-100">
                <ImagePlus className="h-5 w-5 text-white" />
              </span>
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-white/60">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Community name" className="rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-white/60">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="What's this community about?"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              />
            </div>

            {/* Rules & About are rich docs (embeds included) — edited inline from
                the Information widget on the community page. */}
            <button
              type="button"
              onClick={() => navigate(`/community/c/${community.slug}`)}
              className="group/info flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                <Info className="h-4 w-4 text-white/80" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Rules &amp; About</p>
                <p className="text-xs text-muted-foreground">Edit inline from the Information widget — playlists, tier lists, media and more.</p>
              </div>
              <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-white/50 transition-transform group-hover/info:translate-x-0.5" />
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" className="rounded-full" onClick={() => navigate(`/community/c/${community.slug}`)}>Cancel</Button>
            <Button className="gap-1.5 rounded-full px-5 font-bold" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </Button>
          </div>

          {/* Danger zone — deleting a community is owner/creator/admin only (never mods). */}
          {canDelete && (
            <div className="mt-10 rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-rose-300">Delete community</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Permanently removes this community, its memberships and staff. Posts stay but lose their community. This can’t be undone.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0 gap-1.5 rounded-full"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          )}

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{community.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the community and removes all members. Posts made here will remain but will no longer belong to a community. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteCommunity.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={remove}
                  disabled={deleteCommunity.isPending}
                  className="bg-rose-600 text-white hover:bg-rose-600/90"
                >
                  {deleteCommunity.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                  Delete community
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <input ref={iconRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, setIcon)} />
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e, setBanner)} />
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
