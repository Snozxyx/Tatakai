import { randomUUID } from '../../lib/uuid';
import { ThemedSelect } from '@/components/ui/themed-select';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Draft<T> = { id: string; title: string; savedAt: string; value: T };

/** Drafts stay private to the signed-in account on this browser. */
export function PostDrafts<T>({ userId, scope, value, title, disabled, onRestore, publishRef, selectedId, onSelectedIdChange }: {
  userId: string; scope: string; value: T; title: string; disabled?: boolean;
  selectedId?: string; onSelectedIdChange?: (id: string) => void;
  onRestore: (value: T) => void; publishRef?: MutableRefObject<(() => void) | null>;
}) {
  const key = `tatakai-post-drafts:${userId}:${scope}`;
  const [drafts, setDrafts] = useState<Draft<T>[]>([]);
  const [localSelected, setLocalSelected] = useState('');
  const selected = selectedId ?? localSelected;
  const setSelected = onSelectedIdChange ?? setLocalSelected;
  const previousKey = useRef(key);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      setDrafts(Array.isArray(stored) ? stored : []);
    } catch { setDrafts([]); }
    if (previousKey.current !== key) { setSelected(''); previousKey.current = key; }
  }, [key, setSelected]);
  const persist = (next: Draft<T>[]) => {
    localStorage.setItem(key, JSON.stringify(next));
    setDrafts(next);
  };
  useEffect(() => {
    if (!publishRef) return;
    publishRef.current = () => {
      if (!selected) return;
      try { persist(drafts.filter((d) => d.id !== selected)); setSelected(''); }
      catch { toast.error('Published, but could not remove the saved draft.'); }
    };
    return () => { publishRef.current = null; };
  });
  return <div className="my-3 flex flex-wrap items-center gap-2">
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
      try {
        const id = selected || randomUUID();
        persist([{ id, title: title.trim() || 'Untitled post', savedAt: new Date().toISOString(), value }, ...drafts.filter((d) => d.id !== id)]);
        setSelected(id);
        toast.success('Draft saved on this browser.');
      } catch { toast.error('Could not save draft. Browser storage may be full.'); }
    }}>Save draft</Button>
    {drafts.length > 0 && <>
      <ThemedSelect aria-label="Saved post drafts" className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm" value={selected} disabled={disabled} onChange={(event) => {
        const draft = drafts.find((d) => d.id === event.target.value);
        if (!draft) { setSelected(''); return; }
        if (!window.confirm('Load this draft? Unsaved changes in the composer will be replaced.')) return;
        setSelected(draft.id);
        onRestore(draft.value);
      }}>
        <option value="">Saved drafts ({drafts.length})</option>
        {drafts.map((d) => <option key={d.id} value={d.id}>{d.title.slice(0, 45)} · {new Date(d.savedAt).toLocaleDateString()}</option>)}
      </ThemedSelect>
      {selected && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => {
        if (!window.confirm('Delete this saved draft?')) return;
        try { persist(drafts.filter((d) => d.id !== selected)); setSelected(''); }
        catch { toast.error('Could not delete draft.'); }
      }}>Delete draft</Button>}
    </>}
    <span className="text-xs text-muted-foreground">Drafts are saved on this browser.</span>
  </div>;
}
