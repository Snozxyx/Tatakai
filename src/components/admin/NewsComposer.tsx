import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  useUiTranslation();
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
      toast.error(uiI18n.t('app.title_must_be_at_least_3_characters_427c0ca3'));
      return;
    }
    if (!content.trim()) {
      toast.error(uiI18n.t('app.content_is_required_ad1138b8'));
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
          toast.success(uiI18n.t('app.news_published_2f14ba8a'));
          reset();
        },
        onError: (err: any) => {
          toast.error(err?.message || uiI18n.t('app.failed_to_publish_news_0b02b697'));
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
          {uiI18n.t('app.publish_news_97679370')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {uiI18n.t('app.posts_to_the_news_feed_as_the_tatakai_news_bot_a_01b1206f')}
        </p>
      </div>

      <GlassPanel className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="news-title">{uiI18n.t('app.title_9616975c')}</Label>
            <Input
              id="news-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={uiI18n.t('app.headline_442250df')}
              maxLength={300}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-content">{uiI18n.t('app.content_3d7dfe5a')}</Label>
            <Textarea
              id="news-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={uiI18n.t('app.body_of_the_announcement_f293cf90')}
              rows={6}
              maxLength={20000}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="news-excerpt">{uiI18n.t('app.excerpt_e7710108')}</Label>
            <Textarea
              id="news-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder={uiI18n.t('app.optional_short_summary_shown_in_the_feed_card_a3a29ce7')}
              rows={2}
              maxLength={2000}
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="news-image">{uiI18n.t('app.image_url_35c80f96')}</Label>
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
              <Label htmlFor="news-link">{uiI18n.t('app.source_link_9fb9dce1')}</Label>
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
              <Label htmlFor="news-source">{uiI18n.t('app.source_name_475b6ce8')}</Label>
              <Input
                id="news-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={uiI18n.t('app.tatakai_28bda6bd')}
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="news-tags">{uiI18n.t('app.tags_comma_separated_32bf6722')}</Label>
              <Input
                id="news-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={uiI18n.t('app.announcement_update_28166816')}
                disabled={busy}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-sm font-semibold">{uiI18n.t('app.pin_to_top_a94cf538')}</p>
                <p className="text-xs text-muted-foreground">{uiI18n.t('app.keep_this_story_above_the_feed_bda0cf27')}</p>
              </div>
            </div>
            <Switch checked={isPinned} onCheckedChange={setIsPinned} disabled={busy} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              {uiI18n.t('app.clear_719ea396')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {uiI18n.t('app.publishing_74f8114e')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  {uiI18n.t('app.publish_56564005')}
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
