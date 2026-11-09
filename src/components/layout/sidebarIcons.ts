import { LayoutGrid, Search, BookOpen, ScrollText, Users, Plus, Download, TrendingUp, CalendarDays, Heart, Link, type LucideIcon } from 'lucide-react';
import type { SidebarItemId, BuiltinSidebarItemId } from '@/lib/sidebarCustomization';
export const SIDEBAR_ICONS: Record<BuiltinSidebarItemId, LucideIcon> = {
  home: LayoutGrid, search: Search, manga: BookOpen, novels: ScrollText, community: Users, sources: Plus,
  downloads: Download, trending: TrendingUp, calendar: CalendarDays, favorites: Heart,
};
export function sidebarIcon(id: SidebarItemId): LucideIcon { return SIDEBAR_ICONS[id as BuiltinSidebarItemId] || Link; }
