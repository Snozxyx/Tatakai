import uiI18n from '@/lib/uiI18n';
import { Play, CheckCircle, Eye, Pause, XCircle } from 'lucide-react';

/** Shared status vocab for the profile watchlist/readlist/history tabs. */
export const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  watching: { get label() { return uiI18n.t('app.watching_96d9e027'); }, icon: <Play className="w-3 h-3" />, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  completed: { get label() { return uiI18n.t('app.completed_1798b3ba'); }, icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400', bg: 'bg-green-400/10' },
  plan_to_watch: { get label() { return uiI18n.t('app.plan_to_watch_5a9fd746'); }, icon: <Eye className="w-3 h-3" />, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  on_hold: { get label() { return uiI18n.t('app.on_hold_73fd29ee'); }, icon: <Pause className="w-3 h-3" />, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  dropped: { get label() { return uiI18n.t('app.dropped_8cf622d3'); }, icon: <XCircle className="w-3 h-3" />, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export const MANGA_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  reading: { get label() { return uiI18n.t('app.reading_cffa2af0'); }, color: 'text-blue-300', bg: 'bg-blue-500/15' },
  completed: { get label() { return uiI18n.t('app.completed_1798b3ba'); }, color: 'text-green-300', bg: 'bg-green-500/15' },
  plan_to_read: { get label() { return uiI18n.t('app.plan_to_read_1f74de73'); }, color: 'text-amber-300', bg: 'bg-amber-500/15' },
  on_hold: { get label() { return uiI18n.t('app.on_hold_73fd29ee'); }, color: 'text-orange-300', bg: 'bg-orange-500/15' },
  dropped: { get label() { return uiI18n.t('app.dropped_8cf622d3'); }, color: 'text-red-300', bg: 'bg-red-500/15' },
};

/**
 * Per-status accent (ambient glow, status dot, hover ring, text) shared by the
 * shelf headers/cards across the watchlist and manga readlist. Covers both the
 * anime statuses (watching/plan_to_watch) and manga statuses (reading/
 * plan_to_read); completed/on_hold/dropped are common to both.
 */
export const STATUS_ACCENT: Record<string, { glow: string; dot: string; ring: string; text: string }> = {
  watching: { glow: 'bg-sky-500/25', dot: 'bg-sky-400', ring: 'group-hover:ring-sky-400/40', get text() { return uiI18n.t('app.text_sky_300_043e948b'); } },
  reading: { glow: 'bg-sky-500/25', dot: 'bg-sky-400', ring: 'group-hover:ring-sky-400/40', get text() { return uiI18n.t('app.text_sky_300_043e948b'); } },
  completed: { glow: 'bg-emerald-500/25', dot: 'bg-emerald-400', ring: 'group-hover:ring-emerald-400/40', get text() { return uiI18n.t('app.text_emerald_300_23628631'); } },
  plan_to_watch: { glow: 'bg-amber-500/25', dot: 'bg-amber-400', ring: 'group-hover:ring-amber-400/40', get text() { return uiI18n.t('app.text_amber_300_ad08f249'); } },
  plan_to_read: { glow: 'bg-amber-500/25', dot: 'bg-amber-400', ring: 'group-hover:ring-amber-400/40', get text() { return uiI18n.t('app.text_amber_300_ad08f249'); } },
  on_hold: { glow: 'bg-orange-500/25', dot: 'bg-orange-400', ring: 'group-hover:ring-orange-400/40', get text() { return uiI18n.t('app.text_orange_300_7ba1b044'); } },
  dropped: { glow: 'bg-rose-500/25', dot: 'bg-rose-400', ring: 'group-hover:ring-rose-400/40', get text() { return uiI18n.t('app.text_rose_300_f554fc59'); } },
};

/** The verbatim bento card shell used across profile tabs (glow uses --profile-accent). */
export const TAB_PANEL_CLASS =
  'relative overflow-hidden p-5 sm:p-7 border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl';
