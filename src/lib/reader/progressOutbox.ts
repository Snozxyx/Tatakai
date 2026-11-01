import { supabase } from '@/integrations/supabase/client';
type Progress = { manga_id: string; user_id: string; updated_at: string; [key: string]: unknown };
const key = (userId: string) => `tatakai-reading-outbox:${userId}`;
function read(userId: string): Record<string, Progress> {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '{}'); } catch { return {}; }
}
export function queueReadingProgress(payload: Progress) {
  const rows = read(payload.user_id);
  rows[payload.manga_id] = payload;
  localStorage.setItem(key(payload.user_id), JSON.stringify(rows));
}
export function acknowledgeReadingProgress(payload: Progress) {
  const rows = read(payload.user_id);
  if (JSON.stringify(rows[payload.manga_id]) !== JSON.stringify(payload)) return;
  delete rows[payload.manga_id]; localStorage.setItem(key(payload.user_id), JSON.stringify(rows));
}
const writes = new Map<string, Promise<any>>();
/** Serialize remote writes while local mirrors update immediately. */
export function writeReadingProgress(payload: Progress): Promise<any> {
  const identity = `${payload.user_id}:${payload.manga_id}`;
  const previous = writes.get(identity) || Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    if (JSON.stringify(read(payload.user_id)[payload.manga_id]) !== JSON.stringify(payload)) return { data: null, error: null };
    const result = await supabase.from('manga_readlist').upsert(payload as never, { onConflict:'user_id,manga_id' }).select().abortSignal(AbortSignal.timeout(15000)).single();
    if (!result.error) acknowledgeReadingProgress(payload);
    return result;
  }).finally(() => { if (writes.get(identity) === task) writes.delete(identity); });
  writes.set(identity, task); return task;
}
const flushing = new Map<string, Promise<void>>();
export function flushReadingProgress(userId: string): Promise<void> {
  if (flushing.has(userId)) return flushing.get(userId)!;
  const task = (async () => {
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id !== userId) return;
    for (const payload of Object.values(read(userId))) {
      const { data: existing, error: readError } = await supabase.from('manga_readlist').select('updated_at').eq('user_id', userId).eq('manga_id', payload.manga_id).maybeSingle();
      if (readError) return;
      if (!existing || Date.parse(existing.updated_at) <= Date.parse(payload.updated_at)) {
        const { error } = await writeReadingProgress(payload);
        if (error) return;
      }
      acknowledgeReadingProgress(payload);
    }
  })().finally(() => flushing.delete(userId));
  flushing.set(userId, task); return task;
}
