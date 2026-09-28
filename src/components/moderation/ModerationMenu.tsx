import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Flag,
  MessageSquareOff,
  MessageSquare,
  Repeat2,
  Quote,
  Ban,
  ShieldCheck,
  Trash2,
  Pin,
  PinOff,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ReportModal } from '@/components/ui/ReportModal';
import { BanUserDialog } from '@/components/moderation/BanUserDialog';
import {
  useContentFlags,
  useSetContentFlags,
  useSetCommentPinned,
  type ModContentType,
} from '@/hooks/moderation/useModeration';

const REPORT_TARGET: Record<ModContentType, 'comment' | 'anime' | 'post' | 'tierlist' | 'playlist' | 'user'> = {
  comment: 'comment',
  forum_post: 'post',
  tier_list: 'tierlist',
  playlist: 'playlist',
  anime: 'anime',
  user: 'user',
};

export interface ModerationMenuItemsProps {
  contentType: ModContentType;
  contentId: string;
  authorUserId?: string | null;
  authorName?: string;
  /** Show the pause-comments toggle (content that carries a comment thread). */
  showPauseComments?: boolean;
  /** Show repost / requote toggles (feed posts). */
  showRepostControls?: boolean;
  /** Current pin state for a comment (enables staff Pin/Unpin for comments). */
  isPinned?: boolean;
  /** When provided, staff get a "Delete (tombstone)" item that calls this. */
  onStaffDelete?: () => void;
}

/**
 * The moderation-specific dropdown items (report + staff flags/ban/admin link),
 * to slot into a surface's existing DropdownMenuContent. Renders its own Report
 * and Ban dialogs (both portal out, so nesting under the menu is fine).
 */
export function ModerationMenuItems({
  contentType,
  contentId,
  authorUserId,
  authorName,
  showPauseComments,
  showRepostControls,
  isPinned,
  onStaffDelete,
}: ModerationMenuItemsProps) {
  const { user, isAdmin, isModerator } = useAuth();
  const navigate = useNavigate();
  const isStaff = isAdmin || isModerator;
  const isSelf = !!user?.id && !!authorUserId && user.id === authorUserId;

  const [reportOpen, setReportOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);

  const { data: flags } = useContentFlags(
    contentType,
    contentId,
    isStaff && (!!showPauseComments || !!showRepostControls),
  );
  const setFlags = useSetContentFlags();
  const setPinned = useSetCommentPinned();

  const togglePin = async () => {
    try {
      await setPinned.mutateAsync({ commentId: contentId, pinned: !isPinned });
      toast.success(isPinned ? 'Comment unpinned' : 'Comment pinned');
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  const toggle = async (
    key: 'comments_paused' | 'allow_repost' | 'allow_requote',
    next: boolean,
    okMsg: string,
  ) => {
    try {
      await setFlags.mutateAsync({ contentType, contentId, [key]: next } as any);
      toast.success(okMsg);
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message ?? 'unknown error'));
    }
  };

  return (
    <>
      {user && !isSelf && (
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setReportOpen(true); }}>
          <Flag className="mr-2 h-4 w-4" /> Report
        </DropdownMenuItem>
      )}

      {isStaff && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Staff
          </DropdownMenuLabel>

          {onStaffDelete && !isSelf && (
            <DropdownMenuItem
              className="text-rose-400 focus:text-rose-400 focus:bg-rose-400/10"
              onSelect={(e) => { e.preventDefault(); onStaffDelete(); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete (tombstone)
            </DropdownMenuItem>
          )}

          {contentType === 'comment' && (
            <DropdownMenuItem
              disabled={setPinned.isPending}
              onSelect={(e) => { e.preventDefault(); togglePin(); }}
            >
              {isPinned
                ? <><PinOff className="mr-2 h-4 w-4" /> Unpin comment</>
                : <><Pin className="mr-2 h-4 w-4" /> Pin comment</>}
            </DropdownMenuItem>
          )}

          {showPauseComments && (
            <DropdownMenuItem
              disabled={setFlags.isPending}
              onSelect={(e) => {
                e.preventDefault();
                toggle('comments_paused', !flags?.comments_paused,
                  flags?.comments_paused ? 'Comments resumed' : 'Comments paused');
              }}
            >
              {flags?.comments_paused
                ? <><MessageSquare className="mr-2 h-4 w-4" /> Resume comments</>
                : <><MessageSquareOff className="mr-2 h-4 w-4" /> Pause comments</>}
            </DropdownMenuItem>
          )}

          {showRepostControls && (
            <>
              <DropdownMenuItem
                disabled={setFlags.isPending}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle('allow_repost', !flags?.allow_repost,
                    flags?.allow_repost ? 'Reposting disabled' : 'Reposting enabled');
                }}
              >
                <Repeat2 className="mr-2 h-4 w-4" />
                {flags?.allow_repost ? 'Disable reposting' : 'Enable reposting'}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={setFlags.isPending}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle('allow_requote', !flags?.allow_requote,
                    flags?.allow_requote ? 'Quoting disabled' : 'Quoting enabled');
                }}
              >
                <Quote className="mr-2 h-4 w-4" />
                {flags?.allow_requote ? 'Disable quoting' : 'Enable quoting'}
              </DropdownMenuItem>
            </>
          )}

          {authorUserId && !isSelf && (
            <DropdownMenuItem
              className="text-rose-400 focus:text-rose-400 focus:bg-rose-400/10"
              onSelect={(e) => { e.preventDefault(); setBanOpen(true); }}
            >
              <Ban className="mr-2 h-4 w-4" /> Ban author
            </DropdownMenuItem>
          )}
          {authorUserId && (
            <DropdownMenuItem onSelect={() => navigate(`/admin/user/${authorUserId}`)}>
              <ShieldCheck className="mr-2 h-4 w-4" /> View in Admin
            </DropdownMenuItem>
          )}
        </>
      )}

      {reportOpen && (
        <ReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType={REPORT_TARGET[contentType]}
          targetId={contentId}
          targetName={authorName}
        />
      )}
      {authorUserId && (
        <BanUserDialog open={banOpen} onOpenChange={setBanOpen} userId={authorUserId} userName={authorName} />
      )}
    </>
  );
}

export interface ModerationMenuProps extends ModerationMenuItemsProps {
  align?: 'start' | 'end';
  triggerClassName?: string;
}

/** Standalone kebab menu for surfaces without their own options menu. */
export function ModerationMenu({ align = 'end', triggerClassName, ...items }: ModerationMenuProps) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Moderation"
          onClick={(e) => e.stopPropagation()}
          className={triggerClassName ?? 'shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors'}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()}>
        <ModerationMenuItems {...items} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
