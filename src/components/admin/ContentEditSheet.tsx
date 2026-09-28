import { useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUpdateContent } from '@/hooks/admin/useContentEditor';
import { toast } from 'sonner';

/**
 * Admin content editor (anime + manga info pages).
 *
 * Keys sent in `fields` are the snake_case `content_items` columns the backend
 * whitelists (see TatakaiAPI/src/services/contentAdmin.ts). Only fields the
 * admin actually changed are sent; edits persist to our DB and are visible to
 * every visitor on the next fetch.
 */

export type EditableColumns = {
  title_romaji: string;
  title_english: string;
  title_native: string;
  description: string;
  cover_image_large: string;
  cover_image_medium: string;
  banner_image: string;
  trailer_url: string;
  format: string;
  status: string;
  source: string;
  country_of_origin: string;
  rating: string;
  season: string;
  season_year: number | '';
  episodes: number | '';
  chapters: number | '';
  volumes: number | '';
  duration: number | '';
  episode_sub_count: number | '';
  episode_dub_count: number | '';
  average_score: number | '';
  mean_score: number | '';
  popularity: number | '';
  favourites: number | '';
  genres: string; // comma-separated in the form
};

interface ContentEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** tatakai uuid or AniList numeric id (as string) — resolved server-side. */
  id: string;
  mediaType: 'anime' | 'manga';
  initial: Partial<EditableColumns>;
  /** Heading shown at the top of the sheet. */
  title?: string;
}

type Kind = 'string' | 'number' | 'textarea';

const STRING_KEYS: Array<[keyof EditableColumns, string, Kind]> = [
  ['title_romaji', 'Title (Romaji)', 'string'],
  ['title_english', 'Title (English)', 'string'],
  ['title_native', 'Title (Native)', 'string'],
  ['description', 'Description', 'textarea'],
  ['cover_image_large', 'Poster URL (large)', 'string'],
  ['cover_image_medium', 'Poster URL (medium)', 'string'],
  ['banner_image', 'Banner URL', 'string'],
  ['format', 'Format', 'string'],
  ['status', 'Status', 'string'],
  ['source', 'Source', 'string'],
  ['country_of_origin', 'Country of origin', 'string'],
  ['season', 'Season', 'string'],
  ['genres', 'Genres (comma-separated)', 'string'],
];

const NUMBER_KEYS: Array<[keyof EditableColumns, string]> = [
  ['season_year', 'Season year'],
  ['duration', 'Duration (min/ep)'],
  ['average_score', 'Average score'],
  ['mean_score', 'Mean score'],
  ['popularity', 'Popularity'],
  ['favourites', 'Favourites'],
];

const ANIME_NUMBER_KEYS: Array<[keyof EditableColumns, string]> = [
  ['episodes', 'Episodes'],
];

const MANGA_NUMBER_KEYS: Array<[keyof EditableColumns, string]> = [
  ['chapters', 'Chapters'],
  ['volumes', 'Volumes'],
];

function toFormString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function ContentEditSheet({
  open,
  onOpenChange,
  id,
  mediaType,
  initial,
  title,
}: ContentEditSheetProps) {
  const update = useUpdateContent();
  const [reason, setReason] = useState('');

  // Build the initial form snapshot once per open cycle so the diff is stable.
  const baseline = useMemo(() => {
    const b: Record<string, string> = {};
    for (const [key] of STRING_KEYS) b[key] = toFormString(initial[key]);
    for (const [key] of [...NUMBER_KEYS, ...ANIME_NUMBER_KEYS, ...MANGA_NUMBER_KEYS]) {
      b[key] = toFormString(initial[key]);
    }
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, open]);

  const [form, setForm] = useState<Record<string, string>>(baseline);

  // Reset local state whenever a different item / a new open cycle begins.
  useEffect(() => setForm(baseline), [baseline]);

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const numberKeys = useMemo(
    () => [...NUMBER_KEYS, ...(mediaType === 'anime' ? ANIME_NUMBER_KEYS : MANGA_NUMBER_KEYS)],
    [mediaType],
  );

  async function handleSave() {
    const fields: Record<string, unknown> = {};

    for (const [key] of STRING_KEYS) {
      const next = (form[key] ?? '').trim();
      const prev = (baseline[key] ?? '').trim();
      if (next === prev) continue;
      if (key === 'genres') {
        fields.genres = next
          ? next.split(',').map((g) => g.trim()).filter(Boolean)
          : [];
      } else if (next) {
        fields[key] = next;
      }
    }

    for (const [key] of numberKeys) {
      const next = (form[key] ?? '').trim();
      const prev = (baseline[key] ?? '').trim();
      if (next === prev) continue;
      if (next === '') continue;
      const n = Number(next);
      if (Number.isFinite(n)) fields[key] = n;
    }

    if (Object.keys(fields).length === 0) {
      toast.info('No changes to save.');
      return;
    }

    try {
      await update.mutateAsync({ id, fields, reason: reason.trim() || undefined });
      toast.success('Content updated — changes are now live for everyone.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save content.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-3 border-b border-border/50">
          <SheetTitle>Edit content{title ? `: ${title}` : ''}</SheetTitle>
          <SheetDescription>
            Changes save to the Tatakai database and are visible to all visitors.
            Only edited fields are written; re-syncs from AniList will not overwrite them.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 py-4">
            {STRING_KEYS.map(([key, label, kind]) =>
              kind === 'textarea' ? (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`ce-${key}`}>{label}</Label>
                  <Textarea
                    id={`ce-${key}`}
                    rows={6}
                    value={form[key] ?? ''}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ) : (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`ce-${key}`}>{label}</Label>
                  <Input
                    id={`ce-${key}`}
                    value={form[key] ?? ''}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ),
            )}

            <div className="grid grid-cols-2 gap-3">
              {numberKeys.map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`ce-${key}`}>{label}</Label>
                  <Input
                    id={`ce-${key}`}
                    type="number"
                    value={form[key] ?? ''}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ce-reason">Reason (optional, for the audit log)</Label>
              <Input
                id="ce-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. fixed wrong poster"
              />
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="p-6 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default ContentEditSheet;
