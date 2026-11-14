import { resolveApiV3Base } from "./api/backendOrigin";
import type { AdultCategory } from "./adultContentPolicy";
export interface AdultMedia {
  id: string;
  tatakaiId: string;
  anilistId?: number;
  malId?: number;
  titleRomaji: string;
  titleEnglish?: string;
  titleNative?: string;
  description?: string;
  coverImageLarge?: string;
  bannerImage?: string;
  format?: string;
  status?: string;
  genres: string[];
  adultCategory: AdultCategory;
  isAdult?: boolean;
  averageScore?: number;
  episodes?: number;
  chapters?: number;
  startDate?: { year?: number };
  mediaType: "anime" | "manga" | "novel";
  sourceIds: Record<string, string>;
}
export interface AdultPage {
  source?: "anilist" | "db";
  note?: string;
  media: AdultMedia[];
  pageInfo: { total: number; hasNextPage: boolean; currentPage: number };
}
export async function adultApi<T>(
  path: string,
  params: Record<string, string | undefined> = {},
  signal?: AbortSignal
): Promise<T> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) q.set(k, v);
  });
  const response = await fetch(
    resolveApiV3Base() + "/adult/" + path + (q.size ? "?" + q : ""),
    { signal }
  );
  const raw = await response.json();
  if (!response.ok || !raw.success)
    throw new Error(raw.error || "Adult catalog unavailable");
  return raw.data as T;
}

export interface AdultHome {spotlight:AdultMedia[];trending:AdultMedia[];popular:AdultMedia[];latest:AdultMedia[];top:AdultMedia[];pornhwa:AdultMedia[];trendingSource?:'anilist'|'db';trendingNote?:string;}
