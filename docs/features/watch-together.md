# Watch2Together

Synchronized group watching, rebuilt for V6 around **host-streamed** sessions
rather than everyone independently resolving the same source.

## Host-streamed over a tunnel

Instead of each participant fetching the stream separately, the **host** serves
the stream to the room over a tunnel:

- The host exposes the stream through a **Cloudflare tunnel**
  (`desktop/runtime/warp/` + `desktop/runtime/share-tunnel/`).
- Participants play what the host serves, which keeps everyone on the same source
  and makes sync robust.

## Rooms & access control

- Rooms are **password-protected**, with passwords **hashed** and verified through
  RPCs (the raw password is never stored or sent in the clear).
- Session controls include reconnect recovery, host transfer, a synced
  countdown/scheduled start, and chat.

## Ambient theater

The watch room received an **ambient redesign** — a calmer, theater-style room UI.
Room UI lives under `src/components/watch/room/` (e.g. the queue and side panels).

## Where it lives

- Renderer UI: `src/components/watch/room/`.
- Tunnels / host streaming: `desktop/runtime/warp/`, `desktop/runtime/share-tunnel/`.
- Room state + password RPCs: Supabase (see
  [../architecture/backend-and-data.md](../architecture/backend-and-data.md)).

Migrations for the room/password model are written; applying them is a separate
step per this project's [migration policy](../guides/development.md#migrations).
