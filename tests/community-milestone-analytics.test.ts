import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const later = '00000000-0000-4000-8000-000000000003';
const login = (id: string) =>
  db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),is_admin boolean DEFAULT false,is_moderator boolean DEFAULT false,role text,featured_badge_key text,created_at timestamptz DEFAULT now());
    CREATE TABLE user_badges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),badge_key text,source text,note text,UNIQUE(user_id,badge_key));
    CREATE TABLE app_config(key text PRIMARY KEY,value text);
    CREATE TABLE watch_history(id uuid DEFAULT gen_random_uuid(),user_id uuid);
    CREATE TABLE forum_posts(id uuid DEFAULT gen_random_uuid(),user_id uuid,image_url text,is_approved boolean);
    CREATE TABLE page_visits(id uuid DEFAULT gen_random_uuid(),session_id text,user_id uuid,created_at timestamptz DEFAULT now(),country text,channel text,referrer text,referrer_host text,page_path text DEFAULT '/');
    CREATE TABLE watch_sessions(id uuid DEFAULT gen_random_uuid(),session_id text,user_id uuid,created_at timestamptz DEFAULT now(),watch_duration_seconds integer,genres text[]);
    INSERT INTO auth.users VALUES('${admin}'),('${member}');
    INSERT INTO profiles(user_id,is_admin) VALUES('${admin}',true),('${member}',false);
  `);
  for (const file of [
    '20261015010000_milestone_rewards_and_community_controls.sql',
    '20261015011000_accurate_engagement_analytics.sql',
    '20261015012000_dashboard_server_aggregates.sql',
  ])
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        'utf8'
      )
    );
}, 30_000);
afterAll(() => db.close());

test('milestone grants existing members once; future accounts do not become OGs', async () => {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int count FROM user_badges WHERE badge_key='og'"
  );
  expect(rows[0].count).toBe(2);
  await db.exec(
    `INSERT INTO auth.users VALUES('${later}'); INSERT INTO profiles(user_id) VALUES('${later}');`
  );
  expect(
    (await db.query('SELECT * FROM user_badges WHERE user_id=$1', [later])).rows
  ).toHaveLength(0);
  await db.exec(
    `INSERT INTO user_badges(user_id,badge_key,source) VALUES('${member}','centurion','auto') ON CONFLICT DO NOTHING;`
  );
  expect(
    (await db.query('SELECT * FROM badge_rewards WHERE user_id=$1', [member]))
      .rows
  ).toHaveLength(2);
});

test('reward claiming validates ownership, equips the badge, and is idempotent', async () => {
  const reward = (
    await db.query<{ id: string }>(
      "SELECT id FROM badge_rewards WHERE user_id=$1 AND badge_key='og'",
      [member]
    )
  ).rows[0];
  await login(later);
  await expect(
    db.query('SELECT claim_badge_reward($1,true)', [reward.id])
  ).rejects.toThrow('Reward not found');
  await login(member);
  await db.query('SELECT claim_badge_reward($1,true)', [reward.id]);
  await db.query('SELECT claim_badge_reward($1,true)', [reward.id]);
  expect(
    (
      await db.query<{ featured_badge_key: string }>(
        'SELECT featured_badge_key FROM profiles WHERE user_id=$1',
        [member]
      )
    ).rows[0].featured_badge_key
  ).toBe('og');
  expect(
    (
      await db.query<{ seen_at: string }>(
        'SELECT seen_at FROM badge_rewards WHERE id=$1',
        [reward.id]
      )
    ).rows[0].seen_at
  ).not.toBeNull();
});

test('image approval defaults off and enabled approval cannot be bypassed by editing the flag', async () => {
  await login(member);
  const insert = async () =>
    (
      await db.query<{ id: string; is_approved: boolean }>(
        "INSERT INTO forum_posts(user_id,image_url,is_approved) VALUES($1,'https://example.test/image.jpg',true) RETURNING *",
        [member]
      )
    ).rows[0];
  expect((await insert()).is_approved).toBe(true);
  await expect(db.exec("UPDATE app_config SET value='true' WHERE key='community_image_approval_required'")).rejects.toThrow('Admin only');
  await login(admin);
  await db.exec(
    "UPDATE app_config SET value='true' WHERE key='community_image_approval_required'"
  );
  await login(member);
  const post = await insert();
  expect(post.is_approved).toBe(false);
  expect(
    (
      await db.query<{ is_approved: boolean }>(
        'UPDATE forum_posts SET is_approved=true WHERE id=$1 RETURNING is_approved',
        [post.id]
      )
    ).rows[0].is_approved
  ).toBe(false);
  await login(admin);
  expect(
    (
      await db.query<{ is_approved: boolean }>(
        'UPDATE forum_posts SET is_approved=true WHERE id=$1 RETURNING is_approved',
        [post.id]
      )
    ).rows[0].is_approved
  ).toBe(true);
});

test('server aggregates exceed row caps and unify guest/member identity across sessions', async () => {
  await db.exec(`INSERT INTO page_visits(session_id,visitor_id,created_at)
    SELECT 's-'||n,'v-'||n,(now() AT TIME ZONE 'UTC')::date + interval '1 minute' FROM generate_series(1,1500) n;
    INSERT INTO page_visits(session_id,visitor_id,user_id,created_at) VALUES
    ('member-session','v-1','${member}',(now() AT TIME ZONE 'UTC')::date + interval '2 minutes'),
    ('other-device','other-device','${member}',(now() AT TIME ZONE 'UTC')::date + interval '3 minutes');`);
  await login(member);
  await expect(db.query('SELECT admin_engagement_stats(7)')).rejects.toThrow(
    'Admin only'
  );
  await login(admin);
  const data = (
    await db.query<{ data: any }>('SELECT admin_engagement_stats(7) data')
  ).rows[0].data;
  expect(data.uniqueVisitors).toBe(1500);
  expect(data.todayActive).toBe(1500);
  expect(data.pageViews).toBe(1502);
  expect(data.daily).toHaveLength(7);
  expect(data.hourly).toHaveLength(24);
  expect(data.patterns).toHaveLength(168);
  const dashboard=(await db.query<{data:any}>('SELECT admin_dashboard_stats(7) data')).rows[0].data;
  expect(dashboard.totalVisitors).toBe(1500);
  expect(dashboard.sessionQuality.totalPageViews).toBe(1502);
  expect(dashboard.dailyStats).toHaveLength(7);
  expect(dashboard.hourlyActivity).toHaveLength(24);
  expect(dashboard.topPages[0].sessions).toBe(1502);
});

test('D1/D7 exclude immature cohorts and count actual returns on the follow-up day', async () => {
  await db.exec(`TRUNCATE page_visits;
    INSERT INTO page_visits(session_id,visitor_id,created_at) VALUES
    ('one','one',(now() AT TIME ZONE 'UTC')::date - interval '8 days'),
    ('one-next','one',(now() AT TIME ZONE 'UTC')::date - interval '7 days'),
    ('one-week','one',(now() AT TIME ZONE 'UTC')::date - interval '1 day'),
    ('two','two',(now() AT TIME ZONE 'UTC')::date - interval '8 days'),
    ('new','new',(now() AT TIME ZONE 'UTC')::date);`);
  await login(admin);
  const data = (
    await db.query<{ data: any }>('SELECT admin_engagement_stats(30) data')
  ).rows[0].data;
  for (const offset of [1, 7]) {
    const cohort = data.cohorts.find((row: any) => row.offset_days === offset);
    expect(cohort.eligible).toBe(2);
    expect(cohort.returned).toBe(1);
  }
});

test('multiple tabs in the same device time bucket do not inflate foreground time', async () => {
  await login(member);
  for (const seconds of [20, 30, 15])
    await db.query('SELECT record_engagement($1,$2)', [
      'visitor-device-test',
      seconds,
    ]);
  expect(
    (
      await db.query<{ seconds: number }>(
        'SELECT sum(active_seconds)::int seconds FROM engagement_samples'
      )
    ).rows[0].seconds
  ).toBe(30);
  await db.query('SELECT record_engagement($1,30)', ['second-device-test']);
  await login(admin);
  const data = (
    await db.query<{ data: any }>('SELECT admin_engagement_stats(1) data')
  ).rows[0].data;
  expect(data.daily[0].active_seconds).toBe(30);
  await expect(
    db.query('SELECT record_engagement($1,300)', ['visitor-device-test'])
  ).rejects.toThrow('Invalid active time');
});
