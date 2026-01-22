import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments, useReplies, useAddComment, useDeleteComment, useLikeComment, usePinComment } from '@/hooks/useComments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Heart, Reply, Trash2, ChevronDown, ChevronUp, AlertTriangle, Loader2, Ban, MoreVertical, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CommentsSectionProps {
  animeId: string;
  episodeId?: string;
}

interface CommentItemProps {
  comment: {
    id: string;
    content: string;
    is_spoiler: boolean | null;
    is_pinned: boolean | null;
    likes_count: number | null;
    created_at: string;
    user_id: string;
    parent_id: string | null;
    profile?: {
      display_name: string | null;
      avatar_url: string | null;
      username: string | null;
    };
    user_has_liked?: boolean;
  };
  animeId: string;
  episodeId?: string;
  isReply?: boolean;
}

function CommentItem({ comment, animeId, episodeId, isReply = false }: CommentItemProps) {
  const navigate = useNavigate();
  const { user, isModerator, isAdmin } = useAuth();
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [revealSpoiler, setRevealSpoiler] = useState(false);
  const [isBanning, setIsBanning] = useState(false);
  
  const { data: replies, isLoading: loadingReplies } = useReplies(showReplies ? comment.id : undefined);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const likeComment = useLikeComment();
  const pinComment = usePinComment();

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    await addComment.mutateAsync({
      animeId,
      content: replyContent,
      episodeId,
      parentId: comment.id,
      isSpoiler: false,
    });
    setReplyContent('');
    setShowReplyInput(false);
    setShowReplies(true);
  };

  const handleLike = () => {
    likeComment.mutate({ commentId: comment.id, liked: comment.user_has_liked || false });
  };

  const handleBanUser = async () => {
    if (!isAdmin || !comment.user_id) return;
    setIsBanning(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: true, ban_reason: 'Banned from comment section by admin' })
        .eq('user_id', comment.user_id);
      
      if (error) throw error;
      toast.success('User has been banned');
      // Also delete the comment
      await deleteComment.mutateAsync(comment.id);
    } catch (error: any) {
      toast.error('Failed to ban user: ' + error.message);
    } finally {
      setIsBanning(false);
    }
  };

  const canDelete = user?.id === comment.user_id || isModerator;
  const canModerate = isAdmin; // Admins can always moderate

  return (
    <div className={`${isReply ? 'ml-8 md:ml-12' : ''}`}>
      <div className="flex gap-3 p-3 md:p-4 rounded-xl bg-card/50 border border-border/30">
        <Avatar className="w-8 h-8 md:w-10 md:h-10 shrink-0">
          <AvatarImage src={comment.profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {comment.profile?.display_name?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <button 
              onClick={() => comment.profile?.username && navigate(`/@${comment.profile.username}`)}
              disabled={!comment.profile?.username}
              className={`font-medium text-sm ${comment.profile?.username ? 'hover:text-primary hover:underline cursor-pointer' : ''}`}
            >
              {comment.profile?.display_name || 'Anonymous'}
            </button>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {comment.is_pinned && (
              <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary flex items-center gap-1">
                <Pin className="w-3 h-3" />
                Pinned
              </span>
            )}
            {comment.is_spoiler && (
              <span className="px-2 py-0.5 rounded text-xs bg-destructive/20 text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Spoiler
              </span>
            )}
          </div>
          
          {comment.is_spoiler && !revealSpoiler ? (
            <button
              onClick={() => setRevealSpoiler(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Click to reveal spoiler...
            </button>
          ) : (
            <p className="text-sm text-foreground/90 break-words">{comment.content}</p>
          )}
          
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={handleLike}
              disabled={!user}
              className={`flex items-center gap-1 text-xs transition-colors ${
                comment.user_has_liked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'
              }`}
            >
              <Heart className={`w-4 h-4 ${comment.user_has_liked ? 'fill-current' : ''}`} />
              {comment.likes_count || 0}
            </button>
            
            {!isReply && user && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
            )}
            
            {canDelete && (
              <button
                onClick={() => deleteComment.mutate(comment.id)}
                disabled={deleteComment.isPending}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Direct Pin Button for moderators */}
            {canModerate && (
              <button
                onClick={() => pinComment.mutate({ commentId: comment.id, pinned: !comment.is_pinned })}
                disabled={pinComment.isPending}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.is_pinned ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                }`}
                title={comment.is_pinned ? "Unpin" : "Pin"}
              >
                <Pin className={`w-4 h-4 ${comment.is_pinned ? 'fill-current' : ''}`} />
              </button>
            )}

            {/* Admin moderation menu */}
            {canModerate && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => pinComment.mutate({ commentId: comment.id, pinned: !comment.is_pinned })}
                    disabled={pinComment.isPending}
                  >
                    <Pin className="w-4 h-4 mr-2" />
                    {comment.is_pinned ? 'Unpin Comment' : 'Pin Comment'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => deleteComment.mutate(comment.id)}
                    disabled={deleteComment.isPending}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Comment
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleBanUser}
                    disabled={isBanning}
                    className="text-destructive focus:text-destructive"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {isBanning ? 'Banning...' : 'Ban User'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          {showReplyInput && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[60px] text-sm bg-muted/50"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={addComment.isPending || !replyContent.trim()}
                >
                  {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReplyInput(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {!isReply && (
        <>
          {replies && replies.length > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="flex items-center gap-1 mt-2 ml-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showReplies ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
          
          {showReplies && loadingReplies && (
            <div className="ml-8 mt-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {showReplies && replies && (
            <div className="mt-2 space-y-2">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  animeId={animeId}
                  episodeId={episodeId}
                  isReply
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CommentsSection({ animeId, episodeId }: CommentsSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [newComment, setNewComment] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  
  const { data: comments, isLoading } = useComments(animeId, episodeId);
  const addComment = useAddComment();

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({
      animeId,
      content: newComment,
      episodeId,
      isSpoiler,
    });
    setNewComment('');
    setIsSpoiler(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h3 className="font-display text-xl font-semibold">Comments</h3>
        {comments && (
          <span className="text-sm text-muted-foreground">({comments.length})</span>
        )}
      </div>
      
      {user ? (
        <div className="space-y-3 p-4 rounded-xl bg-card/50 border border-border/30">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            className="min-h-[80px] bg-muted/50"
          />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="spoiler"
                checked={isSpoiler}
                onCheckedChange={(checked) => setIsSpoiler(checked as boolean)}
              />
              <label htmlFor="spoiler" className="text-sm text-muted-foreground cursor-pointer">
                Contains spoilers
              </label>
            </div>
            <Button onClick={handleSubmit} disabled={addComment.isPending || !newComment.trim()}>
              {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Post Comment
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 text-center">
          <p className="text-muted-foreground mb-3">Sign in to join the discussion</p>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              animeId={animeId}
              episodeId={episodeId}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">
          No comments yet. Be the first to share your thoughts!
        </p>
      )}
    </div>
  );
}
