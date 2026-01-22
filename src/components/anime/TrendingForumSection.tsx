import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useForumPosts, type ForumPost } from '@/hooks/useForum';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  MessageSquare, ArrowUp, ChevronRight, TrendingUp, Eye, MessageCircle 
} from 'lucide-react';

function TrendingPostCard({ post, index }: { post: ForumPost; index: number }) {
  const navigate = useNavigate();
  const score = post.upvotes - post.downvotes;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <GlassPanel
        hoverEffect
        className="p-4 cursor-pointer"
        onClick={() => navigate(`/community/forum/${post.id}`)}
      >
        <div className="flex gap-4">
          {/* Rank number */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">#{index + 1}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Flair */}
            {post.flair && (
              <span className="inline-block px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium mb-1">
                {post.flair}
              </span>
            )}
            
            {/* Title */}
            <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors mb-2">
              {post.title}
            </h4>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {post.profiles && (
                <span className="flex items-center gap-1.5">
                  <Avatar className="w-4 h-4">
                    <AvatarImage src={post.profiles.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {(post.profiles.username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-[80px]">{post.profiles.username || 'Anonymous'}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                {score}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                {post.comments_count}
              </span>
            </div>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

export function TrendingForumSection() {
  const navigate = useNavigate();
  const { data: posts = [], isLoading } = useForumPosts({ sortBy: 'hot', limit: 5 });

  if (isLoading) {
    return (
      <section className="mb-16">
        <div className="flex items-center gap-3 mb-6 px-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h2 className="font-display text-2xl font-bold">Trending Discussions</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mb-16">
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h2 className="font-display text-2xl font-bold">Trending Discussions</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/community')}
          className="gap-1 text-muted-foreground hover:text-foreground"
        >
          View All
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.slice(0, 6).map((post, index) => (
          <TrendingPostCard key={post.id} post={post} index={index} />
        ))}
      </div>
    </section>
  );
}
