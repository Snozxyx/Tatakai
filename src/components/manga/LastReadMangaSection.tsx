/**
 * The home page's continue-reading row.
 *
 * The card anatomy now comes from `ResumeCard`, shared with the torrent session
 * row — the two were separately written and had drifted into different paddings,
 * poster sizes and bar heights, and this one carried a hover shadow hardcoded to
 * the primary hue's literal RGB. The reading maths (which chapter, which page,
 * how far through) stays here, because only this section knows it.
 */
import { Link } from 'react-router-dom';
import { BookMarked, BookOpen, Layers } from 'lucide-react';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import {
  RESUME_GRID_CLASS,
  ResumeCard,
  ResumeCardSkeleton,
} from '@/components/shared/ResumeCard';
import { useMangaContinueReading } from '@/hooks/user/useMangaReadlist';
import { useAuth } from '@/contexts/AuthContext';
import { getProxiedImageUrl } from '@/lib/api';

const LIMIT = 6;

export function LastReadMangaSection() {
  const { user } = useAuth();
  const { data: continueRows = [], isLoading } = useMangaContinueReading(LIMIT);

  return (
    <section className="mb-12 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <HomeSectionHeading
        icon={<BookMarked className="w-5 h-5 text-primary" />}
        title="Last Read Manga"
        subtitle={
          continueRows.length > 0
            ? `${continueRows.length} ${continueRows.length === 1 ? 'title' : 'titles'} in progress`
            : undefined
        }
      />

      {isLoading ? (
        <div className={RESUME_GRID_CLASS}>
          {Array.from({ length: 3 }).map((_, index) => (
            <ResumeCardSkeleton key={index} />
          ))}
        </div>
      ) : continueRows.length > 0 ? (
        <div className={RESUME_GRID_CLASS}>
          {continueRows.map((item) => {
            const chapterLabel =
              item.last_chapter_number != null
                ? `Chapter ${item.last_chapter_number}`
                : item.last_chapter_title || 'Last chapter';
            const lastPage = Math.max(0, Number(item.last_page_index || 0));
            const totalPages = Number(item.total_pages || 0);
            const pageLabel = totalPages > 0 ? `${lastPage + 1} / ${totalPages}` : `${lastPage + 1}`;
            const progressPercent =
              totalPages > 0 ? Math.min(100, Math.round(((lastPage + 1) / totalPages) * 100)) : 0;
            const chapterKey = item.last_chapter_key || '';
            // Thread provider + chapter number/title into the query so the reader
            // reaches the extension runtime (it dead-ends without a provider) and
            // shows a real title instead of the raw `provider:key` string.
            // ResumeCard renders a plain <Link href>, so router state is not an
            // option — everything travels as query params.
            const resumeParams = new URLSearchParams();
            resumeParams.set('chapterKey', chapterKey);
            if (item.last_provider) resumeParams.set('provider', item.last_provider);
            if (item.last_chapter_number != null)
              resumeParams.set('chapterNumber', String(item.last_chapter_number));
            if (item.last_chapter_title) resumeParams.set('chapterTitle', item.last_chapter_title);
            resumeParams.set('page', String(lastPage));
            const resumeHref = `/manga/read/${item.manga_id}?${resumeParams.toString()}`;

            return (
              <ResumeCard
                key={item.id}
                href={resumeHref}
                titleHref={`/manga/${item.manga_id}`}
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
                    Page {pageLabel}
                  </span>
                }
                progress={progressPercent}
                progressNote={
                  totalPages > 0 ? (
                    <span className="tabular-nums text-white/60">{totalPages} pages</span>
                  ) : undefined
                }
                fallbackIcon={BookMarked}
              />
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
          
          <h3 className="text-base font-semibold text-white/90">
            {user ? 'No reading history' : 'Track your reading'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-white/50 leading-relaxed">
            {user
              ? 'Open a manga chapter and your progress will automatically appear here.'
              : 'Sign in to automatically track and resume your manga, manhwa, and comics from where you left off.'}
          </p>
          
          {!user && (
            <Link
              to="/auth"
              className="mt-7 inline-flex h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Sign in or register
            </Link>
          )}
        </div>
      )}
    </section>
  );
}