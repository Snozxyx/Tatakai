import { useState } from 'react';
import { toast } from 'sonner';
import { Newspaper, Loader2, Send, Pin } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateNews } from '@/hooks/admin/useCreateNews';

/**
 * Admin news composer (Phase 5). Publishes a headline as the Tatakai News bot
 * via the JWT-guarded TatakaiAPI `/admin/news` route — the same forum_posts
 * News row the ingestion job writes, so it lands in the News feed alongside the
 * aggregated stories. No X-Admin-Secret; auth is the admin's live Supabase JWT.
 */
export function NewsComposer() {
  const createNews = useCreateNews();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const reset = () => {
    setTitle('');
    setContent('');
    setExcerpt('');
    setImageUrl('');
    setLink('');
    setSource('');
    setTags('');
    setIsPinned(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error('Title must be at least 3 characters.');
      return;
    }
    if (!content.trim()) {
      toast.error('Content is required.');
      return;
    }

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    createNews.mutate(
      {
        title: title.trim(),
        content: content.trim(),
        excerpt: excerpt.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        link: link.trim() || undefined,
        source: source.trim() || undefined,
        tags: tagList.length ? tagList : undefined,
        is_pinned: isPinned,
      },
      {
        onSuccess: () => {
          toast.success('News published.');
          reset();
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Failed to publish news.');
        },
      },
    );
  };

  const busy = createNews.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary" />
          Publish News
        </h3>
        <p className="text-xs text-muted-foreground">
          Posts to the News feed as the Tatakai News bot. Add a source link to
          set the article URL and dedup key; leave it blank for an original post.
        </p>
      </div>

      <GlassPanel className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="news-title">Title *</Label>
            <Input
              id="news-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Headline"
              maxLength={300}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-content">Content *</Label>
            <Textarea
              id="news-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Body of the announcement…"
              rows={6}
              maxLength={20000}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-excerpt">Excerpt</Label>
            <Textarea
              id="news-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Optional short summary shown in the feed card"
              rows={2}
              maxLength={2000}
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="news-image">Image URL</Label>
              <Input
                id="news-image"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…/cover.jpg"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-link">Source link</Label>
              <Input
                id="news-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://source.example/article"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-source">Source name</Label>
              <Input
                id="news-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Tatakai"
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-tags">Tags (comma-separated)</Label>
              <Input
                id="news-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="announcement, update"
                disabled={busy}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-sm font-semibold">Pin to top</p>
                <p className="text-xs text-muted-foreground">Keep this story above the feed.</p>
              </div>
            </div>
            <Switch checked={isPinned} onCheckedChange={setIsPinned} disabled={busy} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Clear
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
