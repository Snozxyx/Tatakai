import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTierListComments, useTierListCommentReplies, useAddTierListComment, useDeleteTierListComment, useLikeTierListComment } from '@/hooks/useTierListComments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { RankBadge } from '@/components/ui/RankBadge';
import { getRankNameStyle } from '@/lib/rankUtils';
import { MessageSquare, Heart, Reply, Trash2, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate, Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TierListCommentsSectionProps {
  tierListId: string;
}

interface CommentItemProps {
  comment: {
    id: string;
    content: string;
    likes_count: number;
    created_at: string;
    user_id: string;
    parent_id: string | null;
    profile?: {
      display_name: string | null;
      avatar_url: string | null;
      username: string | null;
      total_episodes: number;
    };
    user_liked?: boolean;
  };
  tierListId: string;
  isReply?: boolean;
}

function CommentItem({ comment, tierListId, isReply = false }: CommentItemProps) {
  
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  
  const { data: replies, isLoading: loadingReplies } = useTierListCommentReplies(showReplies ? comment.id : undefined);
  const addComment = useAddTierListComment();
  const deleteComment = useDeleteTierListComment();
  const likeComment = useLikeTierListComment();

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    await addComment.mutateAsync({
      tierListId,
      content: replyContent,
      parentId: comment.id,
    });
    setReplyContent('');
    setShowReplyInput(false);
    setShowReplies(true);
  };

  const handleLike = () => {
    likeComment.mutate({ commentId: comment.id, liked: comment.user_liked || false });
  };

  const displayName = comment.profile?.display_name || comment.profile?.username || 'Anonymous';
  const canDelete = user && (user.id === comment.user_id || isAdmin);
  const rankStyle = getRankNameStyle(comment.profile?.total_episodes || 0);

  return (
    <div className={cn("group", isReply && "ml-8 md:ml-12")}>
      <GlassPanel className="p-4 transition-all duration-200">
        <div className="flex gap-3">
          <Avatar
            className="w-8 h-8 flex-shrink-0 cursor-pointer hover:ring-2 ring-primary/30 transition-all"
            onClick={() => comment.profile?.username && navigate(`/@${comment.profile.username}`)}
          >
            <AvatarImage src={comment.profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-primary-foreground text-xs font-bold">
              {displayName[0]?.toUpperCase() || 'A'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                to={comment.profile?.username ? `/@${comment.profile.username}` : '#'}
                className={cn('text-sm font-semibold hover:opacity-80 transition-opacity truncate', rankStyle.className)}
                style={rankStyle.style}
              >
                {displayName}
              </Link>
              <RankBadge
                episodeCount={comment.profile?.total_episodes || 0}
                size="xs"
              />
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>

            <p className="text-sm text-foreground/90 leading-relaxed mt-1 whitespace-pre-wrap break-words">
              {comment.content}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-2">
              <button
                onClick={handleLike}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                  comment.user_liked
                    ? 'text-rose-400 bg-rose-400/10 hover:bg-rose-400/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', comment.user_liked && 'fill-current')} />
                {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
              </button>

              {!isReply && user && (
                <button
                  onClick={() => setShowReplyInput(!showReplyInput)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <Reply className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => deleteComment.mutate(comment.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}

              {!isReply && (
                <button
                  onClick={() => setShowReplies(!showReplies)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-all ml-auto"
                >
                  {showReplies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showReplies ? 'Hide replies' : 'Replies'}
                </button>
              )}
            </div>

            {/* Reply Input */}
            {showReplyInput && (
              <div className="mt-3 flex gap-2">
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={2}
                  className="resize-none text-sm bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
                />
                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={handleReply} disabled={addComment.isPending || !replyContent.trim()} className="gap-1.5 h-8 text-xs">
                    {addComment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Reply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowReplyInput(false)} className="h-8 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>
      
      {/* Replies */}
      {showReplies && (
        <div className="mt-2 space-y-2">
          {loadingReplies ? (
            <div className="flex items-center justify-center py-4 ml-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            replies?.map(reply => (
              <CommentItem key={reply.id} comment={reply} tierListId={tierListId} isReply />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TierListCommentsSection({ tierListId }: TierListCommentsSectionProps) {
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  
  const { data: comments = [], isLoading } = useTierListComments(tierListId);
  const addComment = useAddTierListComment();

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    await addComment.mutateAsync({
      tierListId,
      content: newComment,
    });
    setNewComment('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h3 className="font-display text-xl font-semibold">Comments</h3>
        <span className="text-muted-foreground">({comments.length})</span>
      </div>
      
      {/* New Comment Form */}
      {user ? (
        <div className="flex gap-3">
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarImage src={user.user_metadata?.avatar_url} />
            <AvatarFallback>{user.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your thoughts about this tier list..."
              className="resize-none min-h-[100px]"
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleSubmit}
                disabled={addComment.isPending || !newComment.trim()}
              >
                {addComment.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Post Comment
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <p>Please sign in to comment</p>
        </div>
      )}
      
      {/* Comments List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          comments.map(comment => (
            <CommentItem key={comment.id} comment={comment} tierListId={tierListId} />
          ))
        )}
      </div>
    </div>
  );
}
