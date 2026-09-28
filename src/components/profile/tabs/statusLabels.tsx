import { Play, CheckCircle, Eye, Pause, XCircle } from 'lucide-react';

/** Shared status vocab for the profile watchlist/readlist/history tabs. */
export const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  watching: { label: 'Watching', icon: <Play className="w-3 h-3" />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  completed: { label: 'Completed', icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400', bg: 'bg-green-400/10' },
  plan_to_watch: { label: 'Plan to Watch', icon: <Eye className="w-3 h-3" />, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  on_hold: { label: 'On Hold', icon: <Pause className="w-3 h-3" />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  dropped: { label: 'Dropped', icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export const MANGA_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  reading: { label: 'Reading', color: 'text-blue-300', bg: 'bg-blue-500/15' },
  completed: { label: 'Completed', color: 'text-green-300', bg: 'bg-green-500/15' },
  plan_to_read: { label: 'Plan to Read', color: 'text-amber-300', bg: 'bg-amber-500/15' },
  on_hold: { label: 'On Hold', color: 'text-orange-300', bg: 'bg-orange-500/15' },
  dropped: { label: 'Dropped', color: 'text-red-300', bg: 'bg-red-500/15' },
};

/**
 * Per-status accent (ambient glow, status dot, hover ring, text) shared by the
 * shelf headers/cards across the watchlist and manga readlist. Covers both the
 * anime statuses (watching/plan_to_watch) and manga statuses (reading/
 * plan_to_read); completed/on_hold/dropped are common to both.
 */
export const STATUS_ACCENT: Record<string, { glow: string; dot: string; ring: string; text: string }> = {
  watching: { glow: 'bg-sky-500/25', dot: 'bg-sky-400', ring: 'group-hover:ring-sky-400/40', text: 'text-sky-300' },
  reading: { glow: 'bg-sky-500/25', dot: 'bg-sky-400', ring: 'group-hover:ring-sky-400/40', text: 'text-sky-300' },
  completed: { glow: 'bg-emerald-500/25', dot: 'bg-emerald-400', ring: 'group-hover:ring-emerald-400/40', text: 'text-emerald-300' },
  plan_to_watch: { glow: 'bg-amber-500/25', dot: 'bg-amber-400', ring: 'group-hover:ring-amber-400/40', text: 'text-amber-300' },
  plan_to_read: { glow: 'bg-amber-500/25', dot: 'bg-amber-400', ring: 'group-hover:ring-amber-400/40', text: 'text-amber-300' },
  on_hold: { glow: 'bg-orange-500/25', dot: 'bg-orange-400', ring: 'group-hover:ring-orange-400/40', text: 'text-orange-300' },
  dropped: { glow: 'bg-rose-500/25', dot: 'bg-rose-400', ring: 'group-hover:ring-rose-400/40', text: 'text-rose-300' },
};

/** The verbatim bento card shell used across profile tabs (glow uses --profile-accent). */
export const TAB_PANEL_CLASS =
  'relative overflow-hidden p-5 sm:p-7 border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl';
