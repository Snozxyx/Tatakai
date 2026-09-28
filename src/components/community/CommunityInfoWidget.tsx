import { useState } from 'react';
import { toast } from 'sonner';
import { Info, ScrollText, BookText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RichCommentComposer } from '@/components/comments/RichCommentComposer';
import { CommunityRichContent } from '@/components/community/CommunityRichContent';
import { serializeCommunityDoc, parseCommunityDoc, communityDocIsEmpty } from '@/lib/communityDoc';
import type { CommentEmbed } from '@/lib/commentEmbeds';
import type { Community } from '@/hooks/community/useCommunities';
import { useUpdateCommunity } from '@/hooks/community/useCommunities';

type Field = 'about' | 'rules';

/**
 * In-context community info: About + Rules shown as a rail widget on the
 * community space page (rather than a separate route). Both are rich docs
 * (formatted text + playlist/tierlist/media embeds, [[community-feed-platform]])
 * rendered via [[CommunityRichContent]]; owners/mods edit each inline with the
 * same rich composer the comments use. Returns null when there's nothing to show
 * and the viewer can't manage.
 */
export function CommunityInfoWidget({
  community,
  canManage,
  className,
}: {
  community: Community;
  canManage: boolean;
  className?: string;
}) {
  const updateCommunity = useUpdateCommunity();
  const [editing, setEditing] = useState<Field | null>(null);

  const save = async (field: Field, payload: { content: string; embeds: CommentEmbed[] }) => {
    const value = serializeCommunityDoc({ content: payload.content, embeds: payload.embeds });
    try {
      await updateCommunity.mutateAsync({ id: community.id, [field]: value });
      toast.success('Saved');
      setEditing(null);
    } catch (err) {
      toast.error('Failed to save', { description: err instanceof Error ? err.message : undefined });
      return false;
    }
  };

  const aboutEmpty = communityDocIsEmpty(community.about) && !community.description?.trim();
  const rulesEmpty = communityDocIsEmpty(community.rules);
  if (aboutEmpty && rulesEmpty && !canManage) return null;

  const renderSection = (
    field: Field,
    Icon: typeof BookText,
    label: string,
    placeholder: string,
  ) => {
    const doc = parseCommunityDoc(community[field]);
    const isEmpty = communityDocIsEmpty(community[field]);
    const showAboutFallback = field === 'about' && isEmpty && !!community.description?.trim();
    if (isEmpty && !showAboutFallback && !canManage) return null;
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-white/60" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</span>
          </div>
          {canManage && editing !== field && (
            <button
              type="button"
              onClick={() => setEditing(field)}
              className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
        {editing === field ? (
          <RichCommentComposer
            allowEmbeds
            showSpoiler={false}
            submitLabel="Save"
            placeholder={placeholder}
            initialContent={doc.content}
            initialEmbeds={doc.embeds}
            onCancel={() => setEditing(null)}
            onSubmit={(payload) => save(field, payload)}
          />
        ) : !isEmpty ? (
          <CommunityRichContent value={community[field]} bodyClassName="text-[13px] leading-relaxed" />
        ) : showAboutFallback ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/75">{community.description}</p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground">{placeholder}</p>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'community-card group flex w-full flex-col',
        className,
      )}
    >
      <div className="pointer-events-none absolute -left-12 -top-12 h-56 w-56 rounded-full bg-primary/10 blur-[90px] transition-colors group-hover:bg-primary/20" />
      <div className="relative z-10 flex items-center gap-2 p-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Info className="h-3.5 w-3.5 text-white/80" />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">Information</span>
      </div>
      <div className="relative z-10 space-y-4 px-4 pb-4">
        {renderSection('about', BookText, 'About', 'Tell members what this community is about…')}
        {renderSection('rules', ScrollText, 'Rules', 'Set the rules for this community…')}
      </div>
    </div>
  );
}
