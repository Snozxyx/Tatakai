import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

test('replays the newest offline position only for its owner and preserves newer remote progress', async () => {
  const dom = new JSDOM('', { url:'https://fixture.test' });
  const originalStorage = globalThis.localStorage;
  Object.assign(globalThis, { localStorage:dom.window.localStorage });
  const { supabase } = await import('../../integrations/supabase/client');
  const { queueReadingProgress, acknowledgeReadingProgress, flushReadingProgress } = await import('./progressOutbox');
  const originalFrom = supabase.from, originalSession = supabase.auth.getSession;
  let owner = 'reader', remoteDate = '2026-10-01T00:00:00Z';
  const writes: unknown[] = [];
  (supabase.auth as any).getSession = async () => ({ data:{ session:{ user:{ id:owner } } } });
  (supabase as any).from = () => {
    const query = { select:()=>query, eq:()=>query, maybeSingle:async()=>({ data:{ updated_at:remoteDate }, error:null }), upsert:(payload:unknown)=>{ writes.push(payload); return { select:()=>({ abortSignal:()=>({ single:async()=>({data:payload,error:null}) }) }) }; } };
    return query;
  };
  const first = { manga_id:'42', user_id:'reader', updated_at:'2026-10-10T00:00:00Z', last_page_index:4 };
  const latest = { ...first, updated_at:'2026-10-11T00:00:00Z', last_page_index:9 };
  try {
    queueReadingProgress(first); queueReadingProgress(latest); acknowledgeReadingProgress(first);
    owner = 'another-account'; await flushReadingProgress('reader'); expect(writes).toHaveLength(0);
    owner = 'reader'; await flushReadingProgress('reader'); expect(writes).toEqual([latest]);
    expect(localStorage.getItem('tatakai-reading-outbox:reader')).toBe('{}');
    queueReadingProgress(first); remoteDate = '2026-10-20T00:00:00Z';
    await flushReadingProgress('reader'); expect(writes).toHaveLength(1);
    expect(localStorage.getItem('tatakai-reading-outbox:reader')).toBe('{}');
  } finally {
    supabase.from = originalFrom; supabase.auth.getSession = originalSession;
    Object.assign(globalThis,{ localStorage:originalStorage }); dom.window.close();
  }
});
