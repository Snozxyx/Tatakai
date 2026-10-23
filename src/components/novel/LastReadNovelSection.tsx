import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * The novel home page's continue-reading row.
 *
 * Same card anatomy as the manga row (`ResumeCard`): poster, chapter +
 * paragraph position, progress bar. Paragraph position reuses the
 * `last_page_index` / `total_pages` columns (see `useNovelReadlist`).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, BookOpen, History, Layers } from 'lucide-react';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import {
  RESUME_GRID_CLASS,
  ResumeCard,
  ResumeCardSkeleton,
} from '@/components/shared/ResumeCard';
import { useNovelReadlist } from '@/hooks/user/useNovelReadlist';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromNovel } from '@/components/media/quickPeekStore';

const LIMIT = 6;

export function LastReadNovelSection() {
  useUiTranslation();
  const { user } = useAuth();
  const { data: readlist = [], isLoading } = useNovelReadlist();

  const continueRows = useMemo(
    () =>
      [...readlist]
        .filter((row) => row.last_chapter_key)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, LIMIT),
    [readlist],
  );

  return (
    <section className="mb-12 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <HomeSectionHeading
        icon={<BookMarked className="w-5 h-5 text-primary" />}
        title={uiI18n.t('app.last_read_novels_50aa0876')}
        subtitle={
          continueRows.length > 0
            ? uiI18n.t('app.i18n_value_0_i18n_value_1_in_progress_36edb6ba', { value0: continueRows.length, value1: continueRows.length === 1 ? 'title' : 'titles' })
            : undefined
        }
        action={
          <Link
            to="/profile?tab=novel-readlist"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={uiI18n.t('app.view_full_novel_reading_history_b6ffa25d')}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {uiI18n.t('app.history_90ccd649')}
          </Link>
        }
      />

      {isLoading ? (
        <div data-mobile-home-rail="resume" className={RESUME_GRID_CLASS}>
          {Array.from({ length: 3 }).map((_, index) => (
            <ResumeCardSkeleton key={index} />
          ))}
        </div>
      ) : continueRows.length > 0 ? (
        <div data-mobile-home-rail="resume" className={RESUME_GRID_CLASS}>
          {continueRows.map((item) => {
            const chapterLabel =
              item.last_chapter_number != null
                ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: item.last_chapter_number })
                : item.last_chapter_title || uiI18n.t('app.last_chapter_c965c810');
            const lastPara = Math.max(0, Number(item.last_page_index || 0));
            const totalParas = Number(item.total_pages || 0);
            const paraLabel = totalParas > 0 ? uiI18n.t('app.i18n_value_0_i18n_value_1_68ff458e', { value0: lastPara + 1, value1: totalParas }) : uiI18n.t('app.i18n_value_0_f0862f54', { value0: lastPara + 1 });
            const progressPercent =
              totalParas > 0 ? Math.min(100, Math.round(((lastPara + 1) / totalParas) * 100)) : 0;
            const chapterKey = item.last_chapter_key || '';
            // Thread provider + chapter number/title into the query so the
            // reader reaches the extension runtime and shows a real title.
            const resumeParams = new URLSearchParams();
            resumeParams.set('chapterKey', chapterKey);
            if (item.last_provider) resumeParams.set('provider', item.last_provider);
            if (item.last_chapter_number != null)
              resumeParams.set('chapterNumber', String(item.last_chapter_number));
            if (item.last_chapter_title) resumeParams.set('chapterTitle', item.last_chapter_title);
            resumeParams.set('paragraph', String(lastPara));
            const resumeHref = `/novel/read/${item.manga_id}?${resumeParams.toString()}`;

            return (
              <Peekable
                key={item.id}
                media={peekFromNovel(
                  { id: item.manga_id, name: item.manga_title, poster: item.manga_poster },
                  `/novel/${item.manga_id}`,
                )}
              >
              <ResumeCard
                href={resumeHref}
                titleHref={`/novel/${item.manga_id}`}
                poster={item.manga_poster ? getProxiedImageUrl(item.manga_poster) : undefined}
                title={item.manga_title}
                primaryMeta={
                  <span className="flex items-center gap-1.5 font-medium text-white/90">
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate">{chapterLabel}</span>
                  </span>
                }
                secondaryMeta={
                  <span className="flex items-center gap-1.5 text-white/50">
                    <Layers className="h-3 w-3" />
                    {uiI18n.t('app.paragraph_05058e0b')} {paraLabel}
                  </span>
                }
                progress={progressPercent}
                progressNote={
                  totalParas > 0 ? (
                    <span className="tabular-nums text-white/60">{totalParas} {uiI18n.t('app.paragraphs_c9355d01')}</span>
                  ) : undefined
                }
                overlayIcon={BookOpen}
                fallbackIcon={BookMarked}
              />
              </Peekable>
            );
          })}
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent px-6 py-16 text-center shadow-sm">
          {/* Subtle top edge accent using primary color */}
          <div className="absolute top-0 h-[1px] w-1/2 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
            <BookMarked className="h-6 w-6 text-primary" />
          </div>

          <h3 className="text-base font-semibold text-foreground">
            {user ? uiI18n.t('app.no_reading_history_f0999143') : uiI18n.t('app.track_your_reading_8b2bfc61')}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
            {user
              ? uiI18n.t('app.open_a_novel_chapter_and_your_progress_will_auto_221ac378')
              : uiI18n.t('app.sign_in_to_automatically_track_and_resume_your_l_1822b1f7')}
          </p>

          {!user && (
            <Link
              to="/auth"
              className="mt-7 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {uiI18n.t('app.sign_in_or_register_bdd855e8')}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
