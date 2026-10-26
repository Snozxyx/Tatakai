import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('badge recomputation and watch-history trigger work without changing ownership or ranking', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(user_id uuid PRIMARY KEY,is_admin boolean DEFAULT false,is_moderator boolean DEFAULT false,featured_badge_key text);
      CREATE TABLE user_badges(user_id uuid,badge_key text,source text,UNIQUE(user_id,badge_key));
      CREATE TABLE watch_history(user_id uuid,anime_id text);
      INSERT INTO profiles(user_id) VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
      INSERT INTO user_badges VALUES('00000000-0000-0000-0000-000000000001','centurion','auto'),('00000000-0000-0000-0000-000000000001','millennium','auto');
      SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
    const original = readFileSync('supabase/migrations/20261001000000_badge_featured_showcase.sql','utf8');
    const start = original.indexOf('CREATE OR REPLACE FUNCTION recompute_featured_badge(');
    await db.exec(original.slice(start,original.indexOf('\n$$;', start)+4));
    await assert.rejects(db.query("SELECT recompute_featured_badge('00000000-0000-0000-0000-000000000001')"), /set-returning functions are not allowed in CASE/);
    await db.exec(readFileSync('supabase/migrations/20261026000001_featured_badge_case_fix.sql','utf8'));
    assert.equal((await db.query("SELECT recompute_featured_badge('00000000-0000-0000-0000-000000000001') AS badge")).rows[0].badge,'millennium');
    await assert.rejects(db.query("SELECT recompute_featured_badge('00000000-0000-0000-0000-000000000002')"),/permission denied/);
    await db.exec(`CREATE FUNCTION history_badge_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM recompute_featured_badge(NEW.user_id); RETURN NEW; END $$;
      CREATE TRIGGER watch_badges AFTER INSERT ON watch_history FOR EACH ROW EXECUTE FUNCTION history_badge_probe();
      INSERT INTO watch_history VALUES('00000000-0000-0000-0000-000000000001','123');`);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM watch_history')).rows[0].count,1);
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(db.query("SELECT recompute_featured_badge('00000000-0000-0000-0000-000000000001')"),/authentication required/);
  } finally { await db.close(); }
});
