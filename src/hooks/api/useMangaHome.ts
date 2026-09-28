import { useQuery } from "@tanstack/react-query";
import { getMangaHome, type MangaHomeFeed } from "@/core/content/manga-client";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";

/**
 * The manga hub's above-the-fold data — one request, shared by every consumer.
 *
 * `MangaHomePage` and `IndexMangaShowcase` (which also renders on the landing
 * page) both read lanes off this. They used to issue four and two
 * `/manga/search` calls respectively, each fetching 12–24 heavy records to
 * render 8–10 posters. Sharing one query key means they now cost one request
 * between them, and a remount costs none.
 *
 * The adult flag is part of the key because the mature lanes only come down when
 * opted in — the server keys its cache the same way.
 */
export function useMangaHome() {
  const { settings } = useContentSafetySettings();
  const adult = settings.showAdultEverywhere;

  const query = useQuery<MangaHomeFeed>({
    queryKey: ["manga-home", adult],
    queryFn: () => getMangaHome(adult),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { ...query, adult };
}
