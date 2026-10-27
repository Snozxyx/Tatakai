import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { HeaderSearchSuggestions } from './HeaderSearchSuggestions';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (!open) {
          previousFocus.current = document.activeElement as HTMLElement;
          setPortalContainer(document.fullscreenElement as HTMLElement | null);
        }
        setOpen(value => !value);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);
  const remember = (term: string) => {
    try {
      const history = JSON.parse(localStorage.getItem('tatakai_search_history') || '[]');
      localStorage.setItem('tatakai_search_history', JSON.stringify([term, ...(Array.isArray(history) ? history : []).filter(item => item !== term)].slice(0, 10)));
    } catch { /* Search remains usable without storage. */ }
    setOpen(false);
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent portalContainer={portalContainer} className="z-[300] max-w-xl gap-3 p-4 sm:p-6" overlayClassName="z-[299]"
      onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); input.current?.select(); }}
      onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input, [data-search-results] button'));
        const index = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}>
      <DialogTitle className="pr-10">Search Tatakai</DialogTitle>
      <DialogDescription>Find anime, manga, and novels. Use arrow keys to browse suggestions.</DialogDescription>
      <form onSubmit={event => {
        event.preventDefault();
        const term = query.trim();
        if (!term) return;
        remember(term);
        navigate(`/search?q=${encodeURIComponent(term)}`);
      }} className="flex items-center gap-3 rounded-lg border border-border px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input ref={input} aria-label="Search anime, manga, and novels" placeholder="Search titles…" value={query}
          onChange={event => setQuery(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
      </form>
      <div data-search-results className="max-h-[min(24rem,50dvh)] overflow-y-auto">
        {open && <HeaderSearchSuggestions query={query} visible inline onSelect={remember} onClose={() => setOpen(false)} />}
        {query.trim().length < 2 && <p className="px-2 py-3 text-sm text-muted-foreground">Type at least two characters to see suggestions.</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
