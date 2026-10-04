import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, LogOut, Search, Settings as SettingsIcon, User } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import { ProfileSettingsSheet } from '@/components/profile/ProfileSettingsSheet';
import { ExtensionSlot } from '@/core/extensions/ExtensionSlot';
import {
  SETTINGS_CATEGORIES,
  SETTINGS_GROUP_ORDER,
  getSettingsCategory,
  type SettingsCategory,
} from './settingsCategories';

/**
 * Discord-style settings popup: a large centered glass modal with a left
 * category rail and a scrollable content pane. Mounted once at the layout root
 * and driven entirely by `useSettingsModal()`. On mobile the rail and panel
 * swap (rail first, panel with a back arrow).
 */
export function SettingsModal() {
  const { open, category, section, closeSettings, setCategory } = useSettingsModal();
  const { user, profile, signOut } = useAuth();
  const isDesktop = useIsDesktopApp();
  const isMobile = useIsMobileApp();

  const [query, setQuery] = useState('');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const categories = useMemo(
    () => SETTINGS_CATEGORIES.filter((c) => (c.requiresMobile ? isMobile : c.requiresNative ? isDesktop : true)),
    [isDesktop, isMobile],
  );

  // Token-based search over each category's label, description and keywords, so
  // a query like "discord" or "download location" surfaces the category that
  // holds that setting even when the words aren't in its label. All tokens must
  // match somewhere; `hint` names the keyword that surfaced a non-obvious match.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories.map((category) => ({ category, hint: undefined as string | undefined }));
    const tokens = q.split(/\s+/).filter(Boolean);
    const results: { category: SettingsCategory; hint?: string }[] = [];
    for (const category of categories) {
      const label = category.label.toLowerCase();
      const description = category.description.toLowerCase();
      const keywords = category.keywords ?? [];
      const haystack = [label, description, ...keywords].join(' | ');
      if (!tokens.every((t) => haystack.includes(t))) continue;
      const inLabelOrDesc = tokens.every((t) => label.includes(t) || description.includes(t));
      const hint = inLabelOrDesc
        ? undefined
        : keywords.find((k) => tokens.every((t) => k.toLowerCase().includes(t)))
          ?? keywords.find((k) => tokens.some((t) => k.toLowerCase().includes(t)));
      results.push({ category, hint });
    }
    return results;
  }, [categories, query]);

  const active = getSettingsCategory(category);
  const ActiveComponent = active.Component;

  // Reset transient UI whenever the modal opens; jump straight to the panel on
  // mobile for deep-links (a section anchor or a non-default category).
  useEffect(() => {
    if (open) {
      setQuery('');
      setMobilePanelOpen(Boolean(section) || category !== 'account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectCategory = (id: typeof category) => {
    setCategory(id);
    setMobilePanelOpen(true);
  };

  const avatarUrl = (profile as any)?.avatar_url as string | undefined;
  const displayName = (profile as any)?.display_name || (profile as any)?.username || 'Guest';
  const username = (profile as any)?.username;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeSettings(); }}>
      <DialogContent className="z-[80] flex flex-col w-[95vw] max-w-6xl h-[88vh] max-h-[88vh] max-md:w-[calc(100vw-1rem)] max-md:h-[94dvh] max-md:max-h-[94dvh] p-0 gap-0 overflow-hidden bg-background/80 backdrop-blur-[40px] border-white/[0.08] rounded-2xl max-md:rounded-3xl shadow-2xl">
        <DialogTitle className="sr-only">Settings — {active.label}</DialogTitle>
        <div className="flex flex-1 min-h-0 min-w-0">
          {/* Left rail */}
          <aside
            className={cn(
              'w-full md:w-64 md:shrink-0 flex-col border-r border-white/[0.06] bg-black/20 min-h-0',
              mobilePanelOpen ? 'hidden md:flex' : 'flex',
            )}
          >
            {/* Profile mini-header */}
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-background/50 border border-white/10 flex items-center justify-center shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{displayName}</p>
                  {username && <p className="text-xs text-muted-foreground truncate">@{username}</p>}
                </div>
              </div>
              {user && (
                <ProfileSettingsSheet
                  trigger={
                    <Button variant="outline" size="sm" className="w-full mt-3">
                      Edit Profile
                    </Button>
                  }
                />
              )}
            </div>

            {/* Filter */}
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings"
                  className="pl-9 h-9 bg-background/50 border-white/10"
                />
              </div>
            </div>

            {/* Grouped nav */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3 space-y-4">
              {SETTINGS_GROUP_ORDER.map((group) => {
                const items = filtered.filter((r) => r.category.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="px-2 mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map(({ category: c, hint }) => {
                        const Icon = c.icon;
                        const isActive = c.id === category;
                        return (
                          <button
                            key={c.id}
                            onClick={() => selectCategory(c.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left transition-colors',
                              isActive
                                ? 'bg-primary/15 text-primary'
                                : 'text-foreground/80 hover:bg-white/5 hover:text-foreground',
                            )}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{c.label}</span>
                              {hint && (
                                <span className="block truncate text-[11px] capitalize text-muted-foreground/70">
                                  {hint}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="px-2 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No settings match “{query.trim()}”.</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">Try “torrent”, “theme”, “language”, or “discord”.</p>
                </div>
              )}
            </nav>

            {/* Log out */}
            {user && (
              <div className="p-3 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { closeSettings(); signOut(); }}
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </Button>
              </div>
            )}
          </aside>
          {/* Right pane */}
          <section
            className={cn(
              'flex-1 min-w-0 flex-col min-h-0',
              mobilePanelOpen ? 'flex' : 'hidden md:flex',
            )}
          >
            {/* Sticky header */}
            <header className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.06] shrink-0">
              <button
                onClick={() => setMobilePanelOpen(false)}
                className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:scale-95"
                aria-label="Back to categories"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <SettingsIcon className="w-5 h-5 text-muted-foreground hidden md:block" />
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight truncate">{active.label}</h2>
                <p className="text-xs text-muted-foreground truncate">{active.description}</p>
              </div>
            </header>

            {/* Scrollable body */}
            <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto custom-scrollbar p-5">
              <ActiveComponent section={section} />

              {/* Extension mount point — bottom of every settings panel (scoped by category). */}
              <ExtensionSlot slotId="settings-panel-bottom" props={{ category }} />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
