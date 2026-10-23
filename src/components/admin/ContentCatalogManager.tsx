import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, ChevronRight, Plus, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TATAKAI_API_URL, withClientHeaders } from '@/lib/api/api-client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContentEditSheet, type EditableColumns } from '@/components/admin/ContentEditSheet';
import { useConfirm } from '@/components/ui/confirm-dialog';

type CatalogRow = Omit<EditableColumns, 'genres'> & { genres: string[] } & {
  tatakai_id: string;
  anilist_id: number | null;
  mal_id: number | null;
  format: string | null;
  is_hidden: boolean;
  updated_at: string;
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in as a Tatakai admin to manage the catalog.');
  const response = await fetch(`${TATAKAI_API_URL}/admin/content${path}`, {
    ...init,
    headers: withClientHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Catalog request failed (${response.status})`);
  return body?.data as T;
}

export function ContentCatalogManager() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [page, setPage] = useState(1);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFormat, setNewFormat] = useState('TV');
  const [newAniList, setNewAniList] = useState('');
  const [newMal, setNewMal] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const params = useMemo(() => new URLSearchParams({ page: String(page), per_page: '30', format, q: submittedQuery, include_hidden: String(includeHidden) }), [page, format, submittedQuery, includeHidden]);
  const entriesQuery = useQuery({
    queryKey: ['admin-catalog', params.toString()],
    queryFn: () => adminFetch<{ entries: CatalogRow[]; total: number; page: number; perPage: number }>(`?${params}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-catalog'] });
  const archive = useMutation({
    mutationFn: (row: CatalogRow) => adminFetch(`/` + encodeURIComponent(row.tatakai_id), { method: 'DELETE' }),
    onSuccess: () => { toast.success('Catalog entry archived.'); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const restore = useMutation({
    mutationFn: (row: CatalogRow) => adminFetch(`/` + encodeURIComponent(row.tatakai_id) + '/restore', { method: 'POST' }),
    onSuccess: () => { toast.success('Catalog entry restored.'); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const create = useMutation({
    mutationFn: () => adminFetch('', { method: 'POST', body: JSON.stringify({ fields: {
      title_romaji: newTitle.trim(), format: newFormat,
      ...(newAniList.trim() ? { anilist_id: Number(newAniList) } : {}),
      ...(newMal.trim() ? { mal_id: Number(newMal) } : {}),
      ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
      genres: [], synonyms: [], tags: [], studios: [],
    } }) }),
    onSuccess: () => { toast.success('Catalog entry created.'); setCreating(false); setNewTitle(''); setNewAniList(''); setNewMal(''); setNewDescription(''); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = entriesQuery.data?.entries ?? [];
  const total = entriesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));

  return <div className="flex flex-col gap-4">
    <GlassPanel className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Catalog entries</h2><p className="text-sm text-muted-foreground">Browse and manage anime, manga, and novels in Supabase.</p></div>
        <Button onClick={() => setCreating(true)}><Plus data-icon="inline-start" />Add entry</Button>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmittedQuery(query.trim()); }}>
        <div className="flex flex-1 gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles" aria-label="Search catalog titles" /><Button type="submit" variant="secondary"><Search data-icon="inline-start" />Search</Button></div>
        <Select value={format} onValueChange={(value) => { setFormat(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by format"><SelectValue placeholder="All formats" /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="all">All formats</SelectItem><SelectItem value="TV">TV</SelectItem><SelectItem value="MOVIE">Movie</SelectItem><SelectItem value="MANGA">Manga</SelectItem><SelectItem value="NOVEL">Novel</SelectItem><SelectItem value="ONE_SHOT">One-shot</SelectItem></SelectGroup></SelectContent>
        </Select>
        <Button type="button" variant={includeHidden ? 'default' : 'outline'} onClick={() => { setIncludeHidden((value) => !value); setPage(1); }}>{includeHidden ? 'Showing archived' : 'Include archived'}</Button>
      </form>
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{total.toLocaleString()} entries</span><span>Page {page} of {totalPages}</span></div>
    </GlassPanel>

    <div className="flex flex-col gap-2">
      {entriesQuery.isLoading ? <GlassPanel className="p-8 text-center text-muted-foreground">Loading catalog…</GlassPanel> : null}
      {entriesQuery.error ? <GlassPanel className="p-6 text-destructive">{(entriesQuery.error as Error).message}</GlassPanel> : null}
      {!entriesQuery.isLoading && !entriesQuery.error && rows.length === 0 ? <GlassPanel className="p-8 text-center text-muted-foreground">No matching catalog entries.</GlassPanel> : null}
      {rows.map((row) => <GlassPanel key={row.tatakai_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-medium">{row.title_romaji}</h3>{row.format && <Badge variant="secondary">{row.format}</Badge>}{row.is_hidden && <Badge variant="outline">Archived</Badge>}</div>
          <p className="truncate text-sm text-muted-foreground">{row.title_english || row.title_native || 'No alternate title'} · AniList {row.anilist_id ?? '—'} · MAL {row.mal_id ?? '—'}</p>
        </div>
        <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(row)}>Edit</Button>{row.is_hidden
          ? <Button size="sm" variant="secondary" disabled={restore.isPending} onClick={() => restore.mutate(row)}><RotateCcw data-icon="inline-start" />Restore</Button>
          : <Button size="sm" variant="destructive" disabled={archive.isPending} onClick={async () => { if (await confirm({ title: `Archive “${row.title_romaji}”?`, description: 'This hides it from the public catalog while preserving user lists and history.', destructive: true })) archive.mutate(row); }}><Archive data-icon="inline-start" />Archive</Button>}</div>
      </GlassPanel>)}
    </div>

    <div className="flex justify-end gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft data-icon="inline-start" />Previous</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight data-icon="inline-end" /></Button></div>

    {editing && <ContentEditSheet open onOpenChange={(open) => !open && setEditing(null)} id={String(editing.anilist_id ?? editing.tatakai_id)} mediaType={editing.format === 'TV' || editing.format === 'MOVIE' || editing.format === 'OVA' || editing.format === 'ONA' || editing.format === 'SPECIAL' || editing.format === 'TV_SHORT' ? 'anime' : 'manga'} initial={{ ...editing, genres: editing.genres?.join(', ') ?? '' }} title={editing.title_romaji} />}

    {creating && <div role="dialog" aria-modal="true" aria-label="Add catalog entry" className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && setCreating(false)}>
      <GlassPanel className="flex w-full max-w-xl flex-col gap-4 p-5"><div><h2 className="text-lg font-semibold">Add catalog entry</h2><p className="text-sm text-muted-foreground">New entries are stored directly in Supabase.</p></div>
        <Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Romaji title (required)" />
        <Select value={newFormat} onValueChange={setNewFormat}><SelectTrigger aria-label="Entry format"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="TV">TV</SelectItem><SelectItem value="MOVIE">Movie</SelectItem><SelectItem value="MANGA">Manga</SelectItem><SelectItem value="NOVEL">Novel</SelectItem><SelectItem value="ONE_SHOT">One-shot</SelectItem></SelectGroup></SelectContent></Select>
        <div className="grid gap-3 sm:grid-cols-2"><Input type="number" min="1" value={newAniList} onChange={(event) => setNewAniList(event.target.value)} placeholder="AniList ID (optional)" /><Input type="number" min="1" value={newMal} onChange={(event) => setNewMal(event.target.value)} placeholder="MAL ID (optional)" /></div>
        <Textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Description (optional)" />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={!newTitle.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Saving…' : 'Create entry'}</Button></div>
      </GlassPanel>
    </div>}
  </div>;
}
