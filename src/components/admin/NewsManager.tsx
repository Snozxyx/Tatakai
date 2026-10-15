import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { toast } from 'sonner';
import {
  Newspaper, RefreshCw, Loader2, Trash2, Pin, PinOff, ExternalLink, Bot, PencilLine,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  useNewsPosts, useRefreshNews, useSetNewsPinned, useDeleteNews, type AdminNewsPost,
} from '@/hooks/admin/useAdminNews';

/**
 * Admin news management: pull fresh stories from the upstream sources on
 * demand, and pin/unpin or delete existing bot-authored News posts. Sits below
 * the composer in the admin News tab.
 */
export function NewsManager() {
  useUiTranslation();
  const confirm = useConfirm();
  const { data: posts = [], isLoading, isError, error } = useNewsPosts();
  const refresh = useRefreshNews();
  const setPinned = useSetNewsPinned();
  const del = useDeleteNews();

  const handleRefresh = async () => {
    try {
      const r = await refresh.mutateAsync();
      toast.success(
        r.inserted > 0
          ? uiI18n.t('app.added_i18n_value_0_new_stori18n_value_1_i18n_val_3fb1878c', { value0: r.inserted, value1: r.inserted === 1 ? 'y' : 'ies', value2: r.aggregated })
          : uiI18n.t('app.no_new_stories_i18n_value_0_aggregated_all_alrea_4a156d86', { value0: r.aggregated }),
      );
    } catch (err: any) {
      toast.error(err?.message || uiI18n.t('app.refresh_failed_0a5e2c85'));
    }
  };

  const handlePin = async (p: AdminNewsPost) => {
    try {
      await setPinned.mutateAsync({ id: p.id, is_pinned: !p.is_pinned });
      toast.success(p.is_pinned ? uiI18n.t('app.unpinned_2ef2575a') : uiI18n.t('app.pinned_to_top_4d672251'));
    } catch (err: any) {
      toast.error(err?.message || uiI18n.t('app.failed_254aaf43'));
    }
  };

  const handleDelete = async (p: AdminNewsPost) => {
    if (!(await confirm({ get title() { return uiI18n.t('app.delete_this_news_post_61c3b16f'); }, description: p.title, destructive: true }))) return;
    try {
      await del.mutateAsync(p.id);
      toast.success(uiI18n.t('app.news_post_deleted_46ac5c00'));
    } catch (err: any) {
      toast.error(err?.message || uiI18n.t('app.failed_to_delete_77c30574'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Newspaper className="h-5 w-5 text-primary" /> {uiI18n.t('app.published_news_bb26d8b5')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {uiI18n.t('app.pull_fresh_headlines_from_the_aggregated_sources_e9919a21')}
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refresh.isPending} className="gap-2">
          {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {uiI18n.t('app.refresh_from_sources_bf7293ed')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary/60" /></div>
      ) : isError ? (
        <GlassPanel className="p-8 text-center text-sm text-muted-foreground">
          {(error as any)?.message || uiI18n.t('app.failed_to_load_news_posts_425cb033')}
        </GlassPanel>
      ) : posts.length === 0 ? (
        <GlassPanel className="p-8 text-center text-sm text-muted-foreground">
          {uiI18n.t('app.no_news_posts_yet_publish_one_above_or_refresh_f_f14f1482')}
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => {
            const source = p.metadata?.source || 'Tatakai';
            const manual = p.metadata?.manual === true;
            const url = p.metadata?.news_url || null;
            return (
              <div
                key={p.id}
                className={`flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 ${p.is_pinned ? 'ring-1 ring-amber-400/30' : ''}`}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-white/5">
                    <Newspaper className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.is_pinned && <Badge variant="secondary" className="gap-1 text-[10px]"><Pin className="h-2.5 w-2.5" /> {uiI18n.t('app.pinned_f9312169')}</Badge>}
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      {manual ? <PencilLine className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />} {source}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium">{p.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-primary">
                        <ExternalLink className="h-3 w-3" /> {uiI18n.t('app.source_828d338a')}
                      </a>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
                    disabled={setPinned.isPending}
                    onClick={() => handlePin(p)}
                    title={p.is_pinned ? uiI18n.t('app.unpin_2eba6a03') : uiI18n.t('app.pin_to_top_a94cf538')}
                  >
                    {p.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-400 hover:bg-rose-400/10 hover:text-rose-400"
                    disabled={del.isPending}
                    onClick={() => handleDelete(p)}
                    title={uiI18n.t('app.delete_f6fdbe48')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
