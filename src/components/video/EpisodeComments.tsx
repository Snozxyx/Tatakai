import { useState } from 'react';
import { useComments, useAddComment, useDeleteComment, useLikeComment } from '@/hooks/useComments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Heart, Trash2, Edit2, Save, X, Shield, AlertTriangle,
  ChevronDown, ChevronUp, EyeOff, Loader2, Send, Pin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { RankBadge } from '@/components/ui/RankBadge';
import { getRankNameStyle } from '@/lib/rankUtils';

interface EpisodeCommentsProps {
  animeId: string;
  episodeId?: string;
  animeName?: string;
}

export function EpisodeComments({ animeId, episodeId, animeName }: EpisodeCommentsProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [newComment, setNewComment] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: comments = [], isLoading } = useComments(animeId, episodeId);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const likeComment = useLikeComment();
  const [editLoading, setEditLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!newComment.trim()) return;
    try {
      await addComment.mutateAsync({
        animeId,
        episodeId,
        content: newComment.trim(),
        isSpoiler,
      });
      setNewComment('');
      setIsSpoiler(false);
    } catch { /* handled by hook */ }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    setEditLoading(true);
    try {
      const { error } = await supabase
        .from('comments')
        .update({ content: editContent.trim(), updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setEditingId(null);
    } catch {
      // handled
    } finally {
      setEditLoading(false);
    }
  };

  const handleLike = async (id: string, currentlyLiked: boolean) => {
    if (!user) { toast.error('Sign in to like comments'); return; }
    await likeComment.mutateAsync({ commentId: id, liked: currentlyLiked });
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sortedComments = [...comments].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="mt-8">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center gap-3 mb-6 group w-full text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl font-bold">
            Comments
          </h2>
          {comments.length > 0 && (
            <Badge variant="secondary" className="text-xs font-bold">
              {comments.length}
            </Badge>
          )}
          {/* Anime / episode context */}
          {animeName && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/50 border border-border/40 text-muted-foreground font-medium">
              {animeName}
              {episodeId && (() => {
                const epNum = episodeId.match(/(\d+)/)?.[1];
                return epNum ? (
                  <>
                    <span className="text-border/60">·</span>
                    <span className="text-primary/80">Ep&nbsp;{epNum}</span>
                  </>
                ) : null;
              })()}
            </span>
          )}
        </div>
        <div className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* Compose */}
            <GlassPanel className="p-4 mb-6">
              <div className="flex gap-3">
                <Avatar className="w-9 h-9 flex-shrink-0 mt-0.5">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold">
                    {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    placeholder={user ? (episodeId ? `Share your thoughts on this episode…` : `Share your thoughts about this anime…`) : 'Sign in to comment'}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    disabled={!user}
                    rows={2}
                    className="resize-none text-sm bg-muted/30 border-border/50 focus:border-primary/50 transition-colors"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setIsSpoiler(prev => !prev)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all',
                        isSpoiler
                          ? 'border-amber/40 bg-amber/10 text-amber'
                          : 'border-border/50 text-muted-foreground hover:border-border'
                      )}
                    >
                      <EyeOff className="w-3 h-3" />
                      Spoiler
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        Ctrl+Enter to send
                      </span>
                      <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={!user || !newComment.trim() || addComment.isPending}
                        className="gap-1.5 h-8 text-xs"
                      >
                        {addComment.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </GlassPanel>

            {/* Comments list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading comments...
              </div>
            ) : sortedComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-muted-foreground">No comments yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Be the first to share your thoughts!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedComments.map((comment, idx) => {
                  const isOwn = comment.user_id === user?.id;
                  const isSpoilerHidden = comment.is_spoiler && !revealedSpoilers.has(comment.id);
                  const isEditing = editingId === comment.id;

                  return (
                    <motion.div
                      key={comment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.25 }}
                    >
                      <GlassPanel
                        className={cn(
                          'p-4 transition-all duration-200',
                          comment.is_pinned && 'border-primary/20 bg-primary/5',
                        )}
                      >
                        {/* Comment header */}
                        <div className="flex items-start gap-3">
                          <Avatar
                            className="w-8 h-8 flex-shrink-0 cursor-pointer hover:ring-2 ring-primary/30 transition-all"
                            onClick={() => comment.profile?.username && navigate(`/@${comment.profile.username}`)}
                          >
                            <AvatarImage src={comment.profile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-primary-foreground text-xs font-bold">
                              {comment.profile?.display_name?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {(() => {
                                const ns = getRankNameStyle(comment.profile?.total_episodes || 0);
                                return (
                                  <button
                                    onClick={() => comment.profile?.username && navigate(`/@${comment.profile.username}`)}
                                    className={cn('text-sm font-semibold hover:opacity-80 transition-opacity truncate', ns.className)}
                                    style={ns.style}
                                  >
                                    {comment.profile?.display_name || 'User'}
                                  </button>
                                );
                              })()}

                              <RankBadge
                                episodeCount={comment.profile?.total_episodes || 0}
                                size="xs"
                              />

                              {comment.profile?.is_admin && (
                                <Badge className="h-4 text-[10px] gap-0.5 px-1.5 bg-primary/15 text-primary border-primary/20">
                                  <Shield className="w-2.5 h-2.5" />
                                  Admin
                                </Badge>
                              )}
                              {comment.is_pinned && (
                                <Badge className="h-4 text-[10px] gap-0.5 px-1.5 bg-amber/15 text-amber border-amber/20">
                                  <Pin className="w-2.5 h-2.5" />
                                  Pinned
                                </Badge>
                              )}
                              {comment.is_spoiler && (
                                <Badge className="h-4 text-[10px] gap-0.5 px-1.5 bg-destructive/15 text-destructive border-destructive/20">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Spoiler
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                              </span>
                            </div>

                            {/* Comment content */}
                            {isEditing ? (
                              <div className="space-y-2 mt-2">
                                <Textarea
                                  value={editContent}
                                  onChange={e => setEditContent(e.target.value)}
                                  rows={2}
                                  className="resize-none text-sm"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleEdit(comment.id)}
                                    disabled={editLoading}
                                    className="h-7 text-xs gap-1"
                                  >
                                    <Save className="w-3 h-3" />
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingId(null)}
                                    className="h-7 text-xs gap-1"
                                  >
                                    <X className="w-3 h-3" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : isSpoilerHidden ? (
                              <button
                                onClick={() => toggleSpoiler(comment.id)}
                                className="mt-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                              >
                                <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-muted/70 transition-colors flex items-center gap-2">
                                  <EyeOff className="w-3.5 h-3.5" />
                                  Click to reveal spoiler
                                </div>
                              </button>
                            ) : (
                              <p className="text-sm text-foreground/90 leading-relaxed mt-1">
                                {comment.content}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Comment actions */}
                        {!isEditing && (
                          <div className="flex items-center gap-1 mt-2 ml-11">
                            <button
                            onClick={() => handleLike(comment.id, comment.user_liked || false)}
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

                            {isOwn && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingId(comment.id);
                                    setEditContent(comment.content);
                                  }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteComment.mutateAsync(comment.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </GlassPanel>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
