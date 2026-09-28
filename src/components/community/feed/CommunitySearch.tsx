import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, User, Music2, Layers, MessageSquare, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getProxiedImageUrl } from '@/lib/api';
import { useCommunitySearch } from '@/hooks/community/useCommunitySearch';
import { cn } from '@/lib/utils';

export interface CommunitySearchProps {
  className?: string;
  /** Controlled query (Item 2 takeover). When provided, the host owns the value. */
  value?: string;
  onValueChange?: (v: string) => void;
  /** Suppress the anchored dropdown — the host renders a full-page takeover instead. */
  suppressDropdown?: boolean;
  /** Grow to the input's full width when focused / non-empty. */
  expandOnFocus?: boolean;
}

/** Debounce a changing value by `delay` ms. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Section label + rows wrapper. */
function Section({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Global community search — users / playlists / tier lists / posts in a glass
 * dropdown anchored to the input. Self-contained (no PopoverAnchor): a document
 * mousedown listener closes it, result clicks navigate then close.
 */
export function CommunitySearch({
  className,
  value,
  onValueChange,
  suppressDropdown = false,
  expandOnFocus = false,
}: CommunitySearchProps) {
  const navigate = useNavigate();
  const controlled = value !== undefined;
  const [internalQuery, setInternalQuery] = useState('');
  const query = controlled ? value : internalQuery;
  const setQuery = (v: string) => {
    if (controlled) onValueChange?.(v);
    else setInternalQuery(v);
  };
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const term = useDebounced(query, 250);
  // Skip the dropdown fetch entirely while the host owns a takeover.
  const { data, isFetching } = useCommunitySearch(suppressDropdown ? '' : term);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (to: string) => {
    navigate(to);
    setOpen(false);
    setQuery('');
  };

  const r = data;
  const hasResults =
    !!r && (r.users.length || r.playlists.length || r.tierlists.length || r.posts.length);
  const showPanel = !suppressDropdown && open && query.trim().length >= 2;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative transition-all duration-300',
        expandOnFocus && (focused || query ? 'w-full sm:w-80 xl:w-96' : 'w-full sm:w-56 xl:w-64'),
        className,
      )}
    >
      <div className="group relative flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] pl-4 pr-2 backdrop-blur-xl transition-all focus-within:border-white/25 focus-within:bg-white/[0.06]">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-white" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); setFocused(true); }}
          onBlur={() => setFocused(false)}
          placeholder="Search community…"
          className="w-full bg-transparent text-sm text-white placeholder:text-muted-foreground/70 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#08090b]/95 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-1">
          {isFetching && !hasResults ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : !hasResults ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">No results for “{query.trim()}”.</div>
          ) : (
            <>
              {r!.users.length > 0 && (
                <Section icon={User} label="Users">
                  {r!.users.map((u) => (
                    <button
                      key={u.user_id}
                      type="button"
                      onClick={() => u.username && go(`/user/${u.username}`)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={u.avatar_url || ''} className="object-cover" />
                        <AvatarFallback className="bg-zinc-800 text-xs font-bold text-zinc-400">
                          {(u.display_name || u.username || '?')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-100">{u.display_name || u.username}</p>
                        {u.username && <p className="truncate text-[11px] text-zinc-500">@{u.username}</p>}
                      </div>
                    </button>
                  ))}
                </Section>
              )}

              {r!.playlists.length > 0 && (
                <Section icon={Music2} label="Playlists">
                  {r!.playlists.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => go(`/playlist/${p.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-900">
                        {p.cover_image ? (
                          <img src={getProxiedImageUrl(p.cover_image)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center"><Music2 className="h-4 w-4 text-zinc-600" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-100">{p.name}</p>
                        <p className="truncate text-[11px] text-zinc-500 tabular-nums">{p.items_count ?? 0} anime</p>
                      </div>
                    </button>
                  ))}
                </Section>
              )}

              {r!.tierlists.length > 0 && (
                <Section icon={Layers} label="Tier Lists">
                  {r!.tierlists.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => go(t.share_code ? `/tierlist/${t.share_code}` : `/tierlists`)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
                        <Layers className="h-4 w-4 text-amber-400" />
                      </div>
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-100">{t.title}</p>
                    </button>
                  ))}
                </Section>
              )}

              {r!.posts.length > 0 && (
                <Section icon={MessageSquare} label="Posts">
                  {r!.posts.map((po) => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => go(`/community/forum/${po.id}`)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                        <MessageSquare className="h-4 w-4 text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {po.title && <p className="truncate text-[13px] font-semibold text-zinc-100">{po.title}</p>}
                        {po.content && <p className="line-clamp-2 text-[12px] text-zinc-500">{po.content.replace(/<[^>]+>/g, ' ')}</p>}
                      </div>
                    </button>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
