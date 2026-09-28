import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, BookText, ScrollText, Loader2, Pencil, Settings } from 'lucide-react';
import { CommunitySidebar } from '@/components/community/feed/CommunitySidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getProxiedImageUrl } from '@/lib/api';
import { useIsNativeApp, useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityBySlug, useUpdateCommunity } from '@/hooks/community/useCommunities';
import { RichCommentComposer } from '@/components/comments/RichCommentComposer';
import { CommunityRichContent } from '@/components/community/CommunityRichContent';
import { serializeCommunityDoc, parseCommunityDoc, communityDocIsEmpty } from '@/lib/communityDoc';
import type { CommentEmbed } from '@/lib/commentEmbeds';

/** Solid-dark community-widget card, matching the feed rail widgets. */
function InfoCard({
  icon: Icon,
  label,
  accent,
  action,
  children,
}: {
  icon: any;
  label: string;
  accent: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="community-card group flex w-full flex-col">
      <div className={cn('pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full blur-[90px] transition-colors', accent)} />
      <div className="relative z-10 flex items-center justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <Icon className="h-3.5 w-3.5 text-white/80" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">{label}</span>
        </div>
        {action}
      </div>
      <div className="relative z-10 px-4 pb-4">{children}</div>
    </div>
  );
}

type EditField = 'rules' | 'about' | null;

export default function CommunityInformationPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const { user, isAdmin, isModerator } = useAuth();
  const { data: community, isLoading } = useCommunityBySlug(slug);
  const updateCommunity = useUpdateCommunity();

  // Owner/mod of this community, its creator, or platform staff may edit.
  const canManage =
    !!community &&
    (community.created_by === user?.id ||
      community.my_role === 'owner' ||
      community.my_role === 'mod' ||
      isAdmin ||
      isModerator);

  const [editingField, setEditingField] = useState<EditField>(null);

  // Persist one rich field (rules/about) as a serialized community doc. Returns
  // false on failure so the composer keeps the draft; undefined lets it clear.
  const save = async (field: 'rules' | 'about', payload: { content: string; embeds: CommentEmbed[] }) => {
    if (!community) return false;
    const value = serializeCommunityDoc({ content: payload.content, embeds: payload.embeds });
    try {
      await updateCommunity.mutateAsync({ id: community.id, [field]: value });
      toast.success('Saved');
      setEditingField(null);
    } catch (err) {
      toast.error('Failed to save', { description: err instanceof Error ? err.message : undefined });
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <CommunitySidebar />
        <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : isNative ? 'pl-0' : 'pl-0 md:pl-24 lg:pl-28')}>
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <h1 className="font-display text-2xl font-bold">Community not found</h1>
            <Button className="mt-4 rounded-full" onClick={() => navigate('/community')}>Back to Community</Button>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  const rulesDoc = parseCommunityDoc(community.rules);
  const aboutDoc = parseCommunityDoc(community.about);

  const editAction = (field: 'rules' | 'about') =>
    canManage && editingField !== field ? (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 rounded-full px-2.5 text-white/70 hover:text-white"
        onClick={() => setEditingField(field)}
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
    ) : null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <CommunitySidebar />

      {/* Ambient banner bleed behind everything */}
      {community.banner_url && (
        <div className="pointer-events-none fixed inset-0 -z-10 h-full w-full overflow-hidden">
          <img
            src={getProxiedImageUrl(community.banner_url)}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-[0.12] blur-[100px] saturate-[2.5] md:opacity-[0.2]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/85 to-background/95" />
        </div>
      )}

      <main className={cn('relative z-10 w-full', isDesktopApp ? 'pl-24 lg:pl-28' : isNative ? 'pl-0' : 'pl-0 md:pl-24 lg:pl-28')}>
        <div className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => navigate(`/community/c/${community.slug}`)}
                className="group/back flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Back to community"
              >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover/back:-translate-x-0.5" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Information</p>
                <h1 className="truncate font-display text-xl font-black tracking-tight md:text-2xl">{community.name}</h1>
              </div>
            </div>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/community/c/${community.slug}/settings`)}
                className="shrink-0 gap-1.5 rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/20"
              >
                <Settings className="h-4 w-4" /> Settings
              </Button>
            )}
          </div>

          <div className="space-y-5">
            {/* Rules */}
            <InfoCard icon={ScrollText} label="Rules" accent="bg-rose-500/10 group-hover:bg-rose-500/20" action={editAction('rules')}>
              {editingField === 'rules' ? (
                <RichCommentComposer
                  allowEmbeds
                  showSpoiler={false}
                  submitLabel="Save"
                  placeholder="Set the rules for this community…"
                  initialContent={rulesDoc.content}
                  initialEmbeds={rulesDoc.embeds}
                  onCancel={() => setEditingField(null)}
                  onSubmit={(payload) => save('rules', payload)}
                />
              ) : !communityDocIsEmpty(community.rules) ? (
                <CommunityRichContent value={community.rules} bodyClassName="text-sm leading-relaxed" />
              ) : (
                <p className="text-sm italic text-muted-foreground">No rules set yet.</p>
              )}
            </InfoCard>

            {/* About */}
            <InfoCard icon={BookText} label="About" accent="bg-primary/10 group-hover:bg-primary/20" action={editAction('about')}>
              {editingField === 'about' ? (
                <RichCommentComposer
                  allowEmbeds
                  showSpoiler={false}
                  submitLabel="Save"
                  placeholder="Tell members what this community is about…"
                  initialContent={aboutDoc.content}
                  initialEmbeds={aboutDoc.embeds}
                  onCancel={() => setEditingField(null)}
                  onSubmit={(payload) => save('about', payload)}
                />
              ) : !communityDocIsEmpty(community.about) ? (
                <CommunityRichContent value={community.about} bodyClassName="text-sm leading-relaxed" />
              ) : community.description?.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{community.description}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">Nothing here yet.</p>
              )}
            </InfoCard>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
