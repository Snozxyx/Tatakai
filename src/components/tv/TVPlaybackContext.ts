import { createContext } from "react";
import type { EpisodeData } from "@/types/anime";

export type TVPlaybackDetails = {
  title: string;
  poster?: string;
  episodes: EpisodeData[];
  currentEpisodeId: string;
  onEpisode(id: string): void;
};
export const TVPlaybackContext = createContext<TVPlaybackDetails | null>(null);

