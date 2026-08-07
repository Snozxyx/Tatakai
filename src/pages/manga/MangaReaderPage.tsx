import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Background } from "@/components/layout/Background";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ArrowLeft, Puzzle, Loader2 } from "lucide-react";
import { getMangaReadByKey } from "@/core/content/manga-client";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";

export default function MangaReaderPage() {
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const { mangaId } = useParams<{ mangaId: string }>();
  const [searchParams] = useSearchParams();
  const chapterKey = searchParams.get("chapterKey") || searchParams.get("chapter") || "";
  const provider = searchParams.get("provider") || "";
  const providerChapterId = searchParams.get("providerChapterId") || chapterKey;

  const { data, isLoading, error } = useQuery({
    queryKey: ["manga-read", mangaId, chapterKey, provider, providerChapterId],
    queryFn: () =>
      getMangaReadByKey(mangaId || "", chapterKey, {
        provider: provider || undefined,
        providerChapterId: providerChapterId || undefined,
      }),
    enabled: Boolean(mangaId && chapterKey),
    retry: false,
  });

  const pages = data?.data?.pages ?? [];
  const [scrollIndex, setScrollIndex] = useState(0);

  useEffect(() => {
    setScrollIndex(0);
  }, [chapterKey, provider]);

  const title = useMemo(() => {
    const chapter = data?.data?.chapter;
    if (!chapter) return "Manga Reader";
    return chapter.title || `Chapter ${chapter.number ?? chapterKey}`;
  }, [data, chapterKey]);

  if (!isNative) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Background />
        <GlassPanel className="w-full max-w-2xl p-8 border border-white/10">
          <div className="flex items-start gap-3">
            <Puzzle className="w-6 h-6 text-primary mt-1" />
            <div>
              <h2 className="text-2xl font-black">Read in the Tatakai app</h2>
              <p className="mt-2 text-muted-foreground">
                Manga chapter pages are delivered by desktop extensions. Download Tatakai to continue reading.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://github.com/snozxyx/tatakai/releases"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold"
              target="_blank"
              rel="noreferrer"
            >
              Download desktop app
            </a>
            <button
              onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/manga")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/manga")}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/15 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="min-w-0">
          <h1 className="font-bold truncate">{title}</h1>
          {provider ? (
            <p className="text-xs text-muted-foreground truncate">Provider: {provider}</p>
          ) : null}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading pages…
          </div>
        ) : null}

        {!isLoading && (!data?.success || pages.length === 0) ? (
          <GlassPanel className="p-6 border border-white/10">
            <h2 className="text-xl font-bold">Unable to load chapter</h2>
            <p className="mt-2 text-muted-foreground">
              {data?.guidance?.message || data?.message || (error instanceof Error ? error.message : "No pages available")}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Pick an extension provider from the chapter hierarchy on the manga page. Tatakai Media is coming soon.
            </p>
          </GlassPanel>
        ) : null}

        {pages.map((page) => (
          <img
            key={page.pageNumber}
            src={page.proxiedImageUrl || page.imageUrl}
            alt={`Page ${page.pageNumber}`}
            className="w-full rounded-lg bg-black/40"
            loading={page.pageNumber <= scrollIndex + 3 ? "eager" : "lazy"}
            onLoad={() => setScrollIndex((v) => Math.max(v, page.pageNumber))}
          />
        ))}
      </div>
    </div>
  );
}
