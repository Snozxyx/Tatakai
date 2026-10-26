import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

// Execute the actual Edge Function with its two remote dependencies injected.
// No Supabase instance, credentials, Deno installation or network is needed.
const source = readFileSync(join(import.meta.dir, '../supabase/functions/send-notification/index.ts'), 'utf8');
const script = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.replace(/^import .*;\r?$/gm, ''));

function fixture({ profile = { is_admin: true, is_moderator: false, role: 'user' }, auditError = null, tokens = [{ token: 'device-fixture' }], authenticated = true } = {}) {
  let handler: (request: Request) => Promise<Response>;
  const inserts: Array<{ table: string; row: any }> = [];
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      let selected = '';
      const query = {
        select(columns: string) { selected = columns; return query; },
        eq() { return query; },
        async maybeSingle() {
          expect(table).toBe('profiles');
          const data = Object.fromEntries(selected.split(',').map((key) => [key.trim(), profile[key.trim()]]));
          return { data, error: null };
        },
        async insert(row: any) {
          inserts.push({ table, row });
          return { error: auditError };
        },
        then(resolve: any, reject: any) {
          expect(table).toBe('user_notification_tokens');
          return Promise.resolve({ data: tokens, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  runInNewContext(script, {
    serve: (callback: typeof handler) => { handler = callback; },
    createClient: (_url: string, _key: string, options: any) => options?.global
      ? { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'caller-fixture' } : null }, error: null }) } }
      : client,
    Deno: { env: { get: () => 'fixture-value' } },
    Response,
    console: { error() {}, warn() {} },
  });
  return {
    inserts, reads,
    request: () => handler(new Request('https://edge.invalid/send-notification', {
      method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test notice', body: 'Fixture body', target: 'all' }),
    })),
  };
}

describe('notification authorization and audit', () => {
  it('records a staff action with the existing admin_logs schema', async () => {
    const { request, inserts } = fixture();
    expect((await request()).status).toBe(200);
    expect(inserts).toEqual([{ table: 'admin_logs', row: {
      user_id: 'caller-fixture', action: 'send_notification', entity_type: 'notification', entity_id: null,
      details: { title: 'Test notice', target: 'all', recipientCount: 1, userId: null },
    } }]);
  });

  it('recognizes moderators whose staff status is stored only in is_moderator', async () => {
    const { request, inserts } = fixture({ profile: { is_admin: false, is_moderator: true, role: 'user' } });
    expect((await request()).status).toBe(200);
    expect(inserts).toHaveLength(1);
  });

  it('denies ordinary users before reading push tokens or writing an audit', async () => {
    const { request, inserts, reads } = fixture({ profile: { is_admin: false, is_moderator: false, role: 'user' } });
    expect((await request()).status).toBe(403);
    expect(reads).toEqual(['profiles']);
    expect(inserts).toHaveLength(0);
  });

  it('does not report success or expose SQL details when Supabase returns an audit error', async () => {
    const { request } = fixture({ auditError: { message: 'sensitive SQL diagnostic', code: '42P01' } });
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });

  it('audits attempts even when no devices are registered', async () => {
    const { request, inserts } = fixture({ tokens: [] });
    expect((await request()).status).toBe(200);
    expect(inserts[0].row.details.recipientCount).toBe(0);
  });

  it('requires a valid user session before accessing service-role tables', async () => {
    const { request, reads } = fixture({ authenticated: false });
    expect((await request()).status).toBe(401);
    expect(reads).toHaveLength(0);
  });
});
