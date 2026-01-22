import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTierListComments, useTierListCommentReplies, useAddTierListComment, useDeleteTierListComment, useLikeTierListComment } from '@/hooks/useTierListComments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Heart, Reply, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
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

  return (
    <div className={cn("group", isReply && "ml-8 md:ml-12")}>
      <div className="flex gap-3 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
        <Link to={comment.profile?.username ? `/@${comment.profile.username}` : '#'}>
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarImage src={comment.profile?.avatar_url || undefined} />
            <AvatarFallback>{displayName[0]?.toUpperCase() || 'A'}</AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Link 
              to={comment.profile?.username ? `/@${comment.profile.username}` : '#'}
              className="font-medium hover:text-primary transition-colors"
            >
              {displayName}
            </Link>
            {comment.profile?.username && (
              <span className="text-xs text-muted-foreground">@{comment.profile.username}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          
          <p className="text-foreground/90 whitespace-pre-wrap break-words mb-3">
            {comment.content}
          </p>
          
          {/* Actions */}
          <div className="flex items-center gap-4 text-sm">
            <button 
              onClick={handleLike}
              className={cn(
                "flex items-center gap-1.5 transition-colors",
                comment.user_liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
              )}
            >
              <Heart className={cn("w-4 h-4", comment.user_liked && "fill-current")} />
              <span>{comment.likes_count || 0}</span>
            </button>
            
            {!isReply && user && (
              <button 
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <Reply className="w-4 h-4" />
                <span>Reply</span>
              </button>
            )}
            
            {canDelete && (
              <button 
                onClick={() => deleteComment.mutate(comment.id)}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            )}
          </div>
          
          {/* Reply Input */}
          {showReplyInput && (
            <div className="mt-4 flex gap-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="resize-none min-h-[80px]"
              />
              <div className="flex flex-col gap-2">
                <Button 
                  size="sm" 
                  onClick={handleReply}
                  disabled={addComment.isPending || !replyContent.trim()}
                >
                  Reply
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setShowReplyInput(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {/* Show/Hide Replies */}
          {!isReply && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="mt-2 flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {showReplies ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showReplies ? 'Hide replies' : 'View replies'}
            </button>
          )}
        </div>
      </div>
      
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
