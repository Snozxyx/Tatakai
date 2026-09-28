import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useBookmarkedPosts } from '@/hooks/community/usePostSocial';
import { PostCard } from '@/components/community/feed/PostCard';

export default function BookmarksPage() {
  const isNative = useIsNativeApp();
  const navigate = useNavigate();
  const { data: posts = [], isLoading } = useBookmarkedPosts();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className={cn('relative z-10 w-full', isNative ? 'pl-0' : 'pl-0 md:pl-20 lg:pl-24')}>
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">
          <Button variant="ghost" onClick={() => navigate('/community')} className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> Community
          </Button>

          <div className="mb-5 flex items-center gap-2.5">
            <Bookmark className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl font-black tracking-tight">Bookmarks</h1>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-[var(--radius)] bg-white/[0.03]" />)}
            </div>
          ) : posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post, i) => (
                <motion.div key={post.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                  <PostCard post={post} />
                </motion.div>
              ))}
            </div>
          ) : (
            <GlassPanel className="rounded-[2rem] border-dashed border-white/10 bg-white/[0.01] p-16 text-center">
              <Bookmark className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
              <h3 className="font-display text-lg font-bold tracking-tight">No bookmarks yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Tap the bookmark icon on a post to save it here.</p>
            </GlassPanel>
          )}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
