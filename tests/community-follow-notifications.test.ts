import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('following respects privacy, publication approval, self exclusion, and existing reply alerts', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE communities(id uuid PRIMARY KEY, name text);
      CREATE TABLE forum_posts(id uuid PRIMARY KEY,user_id uuid,community_id uuid,title text,is_approved boolean,is_deleted boolean DEFAULT false);
      CREATE TABLE comments(id uuid PRIMARY KEY,user_id uuid,entity_type text,entity_id text,parent_id uuid,content text,mentions uuid[],is_spoiler boolean DEFAULT false,is_deleted boolean DEFAULT false);
      CREATE TABLE notifications(user_id uuid,title text,body text,data jsonb);
      INSERT INTO auth.users VALUES ${[1,2,3,4,5].map((n) => `('${uid(n)}')`).join(',')};
      INSERT INTO communities VALUES('${uid(10)}','Anime');
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261019000000_community_follow_notifications.sql', import.meta.url), 'utf8'));
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${uid(2)}',false); SET ROLE authenticated;
      INSERT INTO community_follows(user_id,community_id) VALUES('${uid(2)}','${uid(10)}');`);
    expect((await db.query('SELECT * FROM community_follows')).rows).toHaveLength(1);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${uid(3)}',false);`);
    expect((await db.query('SELECT * FROM community_follows')).rows).toHaveLength(0);
    await expect(db.exec(`INSERT INTO community_follows(user_id,community_id) VALUES('${uid(4)}','${uid(10)}')`)).rejects.toThrow();
    await db.exec(`RESET ROLE;
      INSERT INTO community_follows(user_id,community_id) VALUES('${uid(1)}','${uid(10)}');
      INSERT INTO forum_posts VALUES('${uid(20)}','${uid(1)}','${uid(10)}','Pending',false,false);`);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
    await db.exec(`UPDATE forum_posts SET is_approved=true WHERE id='${uid(20)}'`);
    expect((await db.query('SELECT user_id FROM notifications')).rows).toEqual([{user_id:uid(2)}]);
    await db.exec(`UPDATE forum_posts SET is_approved=false; UPDATE forum_posts SET is_approved=true;`);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(1);
    await db.exec(`TRUNCATE notifications;
      INSERT INTO thread_follows(user_id,post_id) VALUES ${[1,2,3,4].map((n) => `('${uid(n)}','${uid(20)}')`).join(',')};
      INSERT INTO comments(id,user_id,entity_type,entity_id,content) VALUES('${uid(30)}','${uid(3)}','anime','test','Parent');
      INSERT INTO comments(id,user_id,entity_type,entity_id,parent_id,content,mentions) VALUES
        ('${uid(31)}','${uid(1)}','forum_post','${uid(20)}','${uid(30)}','Hello',ARRAY['${uid(4)}']::uuid[]);`);
    const { rows } = await db.query<{user_id:string;data:{link:string}}>('SELECT user_id,data FROM notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(uid(2));
    expect(rows[0].data.link).toBe(`/community/forum/${uid(20)}#comment-${uid(31)}`);
    await db.exec(`TRUNCATE notifications;
      DELETE FROM thread_follows WHERE user_id='${uid(2)}';
      INSERT INTO comments(id,user_id,entity_type,entity_id,parent_id,content,mentions) VALUES
        ('${uid(32)}','${uid(1)}','forum_post','${uid(20)}','${uid(30)}','Hello',ARRAY['${uid(4)}']::uuid[]);`);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
    await db.exec(`UPDATE forum_posts SET is_deleted=true;
      INSERT INTO comments(id,user_id,entity_type,entity_id,content) VALUES('${uid(33)}','${uid(5)}','forum_post','${uid(20)}','Hidden');`);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30000);
