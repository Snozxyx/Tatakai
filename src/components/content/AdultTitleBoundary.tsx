import { extensionRegistry } from '@/core/extensions/ExtensionRegistry';
import { adultApi } from "@/lib/adultApi";
import { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";
import {
  classifyAdultContent,
  normalizeAdultCategories,
} from "@/lib/adultContentPolicy";
import { getAdultMode, requestAdultMode } from "@/lib/adultMode";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { Button } from "@/components/ui/button";
export function AdultTitleBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { settings } = useContentSafetySettings();
  const custom = /^\/x\/([^/]+)\/([^/]+)/.exec(location.pathname);
  const descriptor=custom ? extensionRegistry.getCustomSources().find(source=>source.namespace===decodeURIComponent(custom[1])&&source.id===decodeURIComponent(custom[2])) : undefined;
  const customAdult=Boolean(descriptor && classifyAdultContent(descriptor)) || Boolean(custom && ['hentaidb','hentaidb-comics'].includes(decodeURIComponent(custom[2])));
  const path = location.pathname.replace(/^\/adult/, "");
  const match = /^\/(anime|manga|novel|watch)\/(?:read\/)?([^/]+)$/.exec(path);
  const reserved = new Set(["discover", "genre", "comingsoon"]);
  const id =
    match && !reserved.has(match[2])
      ? decodeURIComponent(match[2]).replace(/\?.*$/, "")
      : null;
  const kind = match?.[1];
  const numeric = /^(?:anilist:|mal:)?\d+$/.test(id || "");
  const uuid = /^[a-f0-9-]{36}$/i.test(id || "");
  const sourceId = /^pornhwadb:\d+$/.test(id || "");
  const canResolve = !!id && (numeric || uuid || sourceId);
  const query = useQuery({
    queryKey: ["adult-route-classification", kind, id],
    queryFn: async ({ signal }) => {
      if (sourceId) {
        if (getAdultMode() !== "adult")
          return { isAdult: true, format: "MANGA" };
        return adultApi("media/" + encodeURIComponent(id!), {}, signal);
      }
      const endpoint =
        (kind === "anime" || kind === "watch" ? "content/" : "manga/") +
        (numeric &&
        kind !== "anime" &&
        kind !== "watch" &&
        !id!.startsWith("mal:")
          ? "by-anilist/" + id!.replace("anilist:", "")
          : encodeURIComponent(id!));
      const response = await fetch(resolveApiV3Base() + "/" + endpoint, {
        signal,
      });
      if (!response.ok) throw new Error("Title metadata is unavailable");
      const raw = await response.json();
      return raw.data?.media ?? raw.data;
    },
    enabled: canResolve,
    staleTime: 300000,
    retry: false,
  });
  if (!canResolve && !customAdult) return <>{children}</>;
  if (canResolve && query.isPending)
    return (
      <div
        role="status"
        aria-label="Loading title"
        className="flex min-h-screen items-center justify-center"
      >
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  if (canResolve && query.error)
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p role="alert">Title metadata is unavailable.</p>
        <Button onClick={() => query.refetch()}>Try again</Button>
      </main>
    );
  const category = customAdult ? "explicit" : classifyAdultContent(query.data);
  if (category && getAdultMode() !== "adult")
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">
          This title belongs in Adult Mode
        </h1>
        <p>Enable Adult Mode to open it.</p>
        <Button onClick={requestAdultMode}>Enable Adult Mode</Button>
      </main>
    );
  if (category && !normalizeAdultCategories(settings.adultCategories)[category])
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        This category is hidden in NSFW settings.
      </main>
    );
  if (!category && getAdultMode() === "adult")
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        Turn off Adult Mode to open this SFW title.
      </main>
    );
  return <>{children}</>;
}
