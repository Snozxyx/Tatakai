/**
 * Custom-source info page (`/x/:namespace/:sourceId/info/:id`).
 *
 * Mirrors the anime/manga detail layout (poster hero + description + a list of
 * entries) but is fully isolated: entries route to `/x/<ns>/<sid>/watch|read/...`
 * by the source's `kind`, and nothing here reads or writes the watchlist/readlist.
 */

import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Loader2, Play } from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl } from "@/lib/api";
import { useCustomInfo, useCustomSource } from "@/hooks/api/useCustomSource";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";

export default function CustomInfoPage() {
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const { namespace, sourceId, id } = useParams<{ namespace: string; sourceId: string; id: string }>();
  const { source } = useCustomSource(namespace, sourceId);
  const { data: info, isLoading, isError } = useCustomInfo(namespace, sourceId, id);

  const kind = source?.kind === "read" ? "read" : "watch";
  const base = `/x/${namespace}/${sourceId}`;
  const entries = info?.entries ?? [];
  const meta = info?.meta ?? {};

  const openEntry = (entryId: string) =>
    navigate(`${base}/${kind}/${encodeURIComponent(id || "")}/${encodeURIComponent(entryId)}`);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {!isNative && <Background />}
      {!isNative && <Sidebar />}

      <main
        className={cn(
          "relative z-10 mx-auto max-w-[1400px] py-6 pr-6 pb-24 md:pb-6",
          isNative ? "pl-6" : "pl-6 md:pl-32",
        )}
      >
        <button
          onClick={() => navigate(base)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" /> {source?.name || "Back"}
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : !info || isError ? (
          <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold">Unable to load this title</h2>
            <p className="mt-2 text-muted-foreground">
              The source returned no info. Check that the extension is running and try again.
            </p>
          </GlassPanel>
        ) : (
          <>
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="w-40 flex-shrink-0 md:w-56">
                <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {info.image ? (
                    <img
                      src={getProxiedImageUrl(info.image)}
                      alt={info.title}
                      className="h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="font-display text-3xl font-black tracking-tight md:text-4xl">{info.title}</h1>

                {/* Extension mount point — after a custom-source title (mirrors anime-details-after-title). */}
                <ExtensionSlot slotId="custom-info-after-title" props={{ namespace, sourceId, id, kind, info }} />

                {Object.keys(meta).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(meta).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-muted-foreground"
                      >
                        <span className="text-foreground/70">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {info.description ? (
                  <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {info.description}
                  </p>
                ) : null}

                {entries.length > 0 ? (
                  <button
                    onClick={() => openEntry(entries[0].id)}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/85"
                  >
                    {kind === "read" ? <BookOpen className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    {kind === "read" ? "Start reading" : "Start watching"}
                  </button>
                ) : null}
              </div>
            </div>

            <section className="mt-10">
              <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">
                {kind === "read" ? "Chapters" : "Episodes"}{" "}
                <span className="text-muted-foreground">({entries.length})</span>
              </h2>
              {entries.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => openEntry(entry.id)}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-white/10"
                    >
                      {entry.number != null ? (
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                          {entry.number}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.label}</span>
                      {kind === "read" ? (
                        <BookOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <Play className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <GlassPanel className="border border-white/10 p-6">
                  <p className="text-sm text-muted-foreground">No entries available for this title.</p>
                </GlassPanel>
              )}
            </section>
          </>
        )}
      </main>

      {!isNative && <MobileNav />}
    </div>
  );
}
