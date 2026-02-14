import { useQuery } from "@tanstack/react-query";

const TATAKAI_API_URL = import.meta.env.VITE_TATAKAI_API_URL || "https://tatakaiapi.vercel.app/api/v1";

async function fetchAnimelok<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TATAKAI_API_URL}/animelok${endpoint}`, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Animelok API error: ${response.status}`);
  }

  const json = await response.json();
  return json.data;
}

export interface ScheduleItem {
  day: string;
  anime: Array<{
    id: string;
    anilistId?: number;
    title: string;
    episode?: number;
    time?: string;
    poster?: string;
    url: string;
  }>;
}

export interface RegionalScheduleItem {
  day: string;
  anime: Array<{
    id: string;
    anilistId?: number;
    title: string;
    time?: string;
    poster?: string;
    url: string;
  }>;
}

export interface Language {
  name: string;
  code: string;
  url: string;
  poster?: string;
}

export interface LanguageAnime {
  id: string;
  anilistId?: number;
  title: string;
  poster?: string;
  url: string;
  rating?: number;
  meta?: string[];
}

export function useAnimelokSchedule() {
  return useQuery<{ schedule: ScheduleItem[] }>({
    queryKey: ["animelok", "schedule"],
    queryFn: () => fetchAnimelok<{ schedule: ScheduleItem[] }>("/schedule"),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useAnimelokRegionalSchedule() {
  return useQuery<{ schedule: RegionalScheduleItem[] }>({
    queryKey: ["animelok", "regional-schedule"],
    queryFn: () => fetchAnimelok<{ schedule: RegionalScheduleItem[] }>("/regional-schedule"),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useAnimelokLanguages() {
  return useQuery<{ languages: Language[] }>({
    queryKey: ["animelok", "languages"],
    queryFn: () => fetchAnimelok<{ languages: Language[] }>("/languages"),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useAnimelokLanguageAnime(language: string, page: number = 1) {
  return useQuery<{ language: string; page: number; anime: LanguageAnime[]; hasNextPage: boolean }>({
    queryKey: ["animelok", "languages", language, page],
    queryFn: () => fetchAnimelok<{ language: string; page: number; anime: LanguageAnime[]; hasNextPage: boolean }>(`/languages/${language}?page=${page}`),
    enabled: !!language,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
export function useAnimelokSearch(query: string) {
  return useQuery<{ animes: LanguageAnime[] }>({
    queryKey: ["animelok", "search", query],
    queryFn: () => fetchAnimelok<{ animes: LanguageAnime[] }>(`/search?q=${encodeURIComponent(query)}`),
    enabled: !!query && query.length > 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
