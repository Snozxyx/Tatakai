import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const room = id(100);
const asUser = (n: number) => `SELECT set_config('request.jwt.claim.sub','${id(n)}',false); SET ROLE authenticated;`;

test('P2P signaling, private TURN state, admission and host fencing enforce room membership', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ${Array.from({ length: 25 }, (_, n) => `('${id(n + 1)}')`).join(',')};
      CREATE TABLE watch_rooms(id uuid PRIMARY KEY,host_id uuid NOT NULL,is_active boolean DEFAULT true,
        max_participants integer DEFAULT 10,updated_at timestamptz DEFAULT now(),is_playing boolean DEFAULT false,
        current_time_seconds float DEFAULT 0,share_active boolean DEFAULT false,
        anime_id text,episode_id text,episode_number integer,category text,manual_stream_url text,selected_server text);
      CREATE TABLE watch_room_participants(room_id uuid REFERENCES watch_rooms(id),user_id uuid REFERENCES auth.users(id),
        is_host boolean DEFAULT false,PRIMARY KEY(room_id,user_id));
      INSERT INTO watch_rooms(id,host_id) VALUES('${room}','${id(1)}');
      INSERT INTO watch_room_participants VALUES('${room}','${id(1)}',true),('${room}','${id(2)}',false),('${room}','${id(3)}',false);
      GRANT SELECT(id,host_id,is_active) ON watch_rooms TO authenticated;
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261024000001_watch_room_p2p.sql', import.meta.url), 'utf8'));
    await db.exec(asUser(1));
    const { rows: [{ state }] } = await db.query<{ state: { p2p_enabled: boolean; max_participants: number } }>(`
      SELECT configure_watch_room_p2p('${room}',true,'pause-together','[{"urls":"turn:relay.example:3478","username":"private","credential":"test-only"}]') state`);
    expect(state.p2p_enabled).toBe(true);
    expect(state.max_participants).toBe(20);
    await expect(db.exec('SELECT * FROM watch_room_p2p_state')).rejects.toThrow();
    await db.exec(`SELECT publish_watch_room_p2p_media('${room}',1,'{"url":"https://cdn.example/video.m3u8","format":"hls","timelineId":"episode-one"}');`);
    await expect(db.exec(`SELECT publish_watch_room_p2p_media('${room}',1,'{"url":"https://cdn.example/old.m3u8","format":"hls","timelineId":"old-episode"}')`)).rejects.toThrow('Stale source revision');
    const revision = (await db.query<{ state: { source_revision: string } }>(`SELECT get_watch_room_p2p_state('${room}') state`)).rows[0].state.source_revision;
    await db.exec(`SELECT watch_room_p2p_heartbeat('${room}',1,42,false,'${revision}')`);
    expect((await db.query<{ state: { current_time_seconds: number } }>(`SELECT get_watch_room_p2p_state('${room}') state`)).rows[0].state.current_time_seconds).toBe(42);
    await expect(db.exec(`SELECT watch_room_p2p_heartbeat('${room}',1,0,false,'${id(99)}')`)).rejects.toThrow('Stale source revision');
    await expect(db.exec(`SELECT publish_watch_room_p2p_media('${room}',1,'{"url":"https://cdn.example/video","format":"hls","timelineId":"x","subtitles":{}}','${revision}')`)).rejects.toThrow('Invalid room tracks');
    await expect(db.exec(`SELECT publish_watch_room_p2p_media('${room}',1,'{"url":"https://cdn.example/video","format":"hls","timelineId":"x","headers":{"Authorization":"blocked"}}')`)).rejects.toThrow();
    await db.exec(`SELECT send_watch_room_p2p_signal('${room}','${id(2)}',1,'connection-a','offer','{"sdp":"test"}')`);
    expect((await db.query('SELECT * FROM watch_room_p2p_signals')).rows).toHaveLength(0);

    await db.exec(`RESET ROLE; ${asUser(2)}`);
    const signals = (await db.query<{ sender_id: string }>('SELECT sender_id FROM watch_room_p2p_signals')).rows;
    expect(signals).toEqual([{ sender_id: id(1) }]);
    expect((await db.query<{ state: { turn_servers: unknown[] } }>(`SELECT get_watch_room_p2p_state('${room}') state`)).rows[0].state.turn_servers).toHaveLength(1);
    await expect(db.exec(`SELECT configure_watch_room_p2p('${room}',false)`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO watch_room_p2p_signals(room_id,sender_id,recipient_id,host_epoch,connection_id,kind,payload)
      VALUES('${room}','${id(1)}','${id(2)}',1,'forged','offer','{}')`)).rejects.toThrow();
    await expect(db.exec(`SELECT send_watch_room_p2p_signal('${room}','${id(3)}',1,'viewer-viewer','offer','{}')`)).rejects.toThrow();
    await expect(db.exec(`SELECT transfer_watch_room_p2p_host('${room}',1,'${id(2)}',true)`)).rejects.toThrow();

    await db.exec(`RESET ROLE; ${asUser(4)}`);
    expect((await db.query('SELECT * FROM watch_room_p2p_signals')).rows).toHaveLength(0);
    await expect(db.exec(`SELECT get_watch_room_p2p_state('${room}')`)).rejects.toThrow();
    await expect(db.exec(`SELECT send_watch_room_p2p_signal('${room}','${id(1)}',1,'outsider','hello','{}')`)).rejects.toThrow();
    await db.exec(`RESET ROLE; UPDATE watch_room_p2p_state SET host_seen_at=now()-interval '31 seconds' WHERE room_id='${room}'; ${asUser(2)}`);
    const transfer = (await db.query<{ state: { host_id: string; host_epoch: number } }>(`SELECT transfer_watch_room_p2p_host('${room}',1,'${id(2)}',true) state`)).rows[0].state;
    expect(transfer.host_id).toBe(id(2));
    expect(transfer.host_epoch).toBe(2);
    expect((await db.query('SELECT * FROM watch_room_p2p_signals')).rows).toHaveLength(0);
    await db.exec(`RESET ROLE; ${asUser(1)}`);
    await expect(db.exec(`SELECT watch_room_p2p_heartbeat('${room}',1)`)).rejects.toThrow();
    await expect(db.exec(`SELECT send_watch_room_p2p_signal('${room}','${id(2)}',1,'stale','hello','{}')`)).rejects.toThrow();

    await db.exec('RESET ROLE');
    for (let n = 4; n <= 20; n++) await db.exec(`INSERT INTO watch_room_participants VALUES('${room}','${id(n)}',false)`);
    await expect(db.exec(`INSERT INTO watch_room_participants VALUES('${room}','${id(21)}',false)`)).rejects.toThrow('Room is full');
    await db.exec(`INSERT INTO watch_rooms(id,host_id) VALUES('${id(101)}','${id(21)}')`);
    await expect(db.exec(`UPDATE watch_room_participants SET room_id='${id(101)}' WHERE room_id='${room}' AND user_id='${id(3)}'`)).rejects.toThrow();
    await db.exec(`UPDATE watch_rooms SET episode_id='next-episode' WHERE id='${room}'`);
    expect((await db.query<{ media: unknown }>(`SELECT media FROM watch_room_p2p_state WHERE room_id='${room}'`)).rows[0].media).toBeNull();
    const privileges = (await db.query<{ allowed: boolean }>(`SELECT has_function_privilege('anon','get_watch_room_p2p_state(uuid)','EXECUTE') allowed`)).rows[0];
    expect(privileges.allowed).toBe(false);
  } finally { await db.close(); }
}, 60000);
