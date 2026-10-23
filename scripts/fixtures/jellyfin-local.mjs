// A bounded local Jellyfin protocol fixture. The extension APK remains original.
// This establishes host/auth/header/subtitle adaptation, not public-server parity.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
export async function jellyfinFixture() {
  const token = randomUUID(), calls = [];
  const media = { Id: 'original-media', Name: 'Local video', Size: 24, Bitrate: 1000000,
    SupportsTranscoding: false, SupportsDirectStream: true,
    MediaStreams: [{ Index: 0, Type: 'Video', BitRate: 1000000, SupportsExternalStream: false, IsExternal: false },
      { Index: 1, Type: 'Subtitle', Codec: 'vtt', Language: 'eng', DisplayTitle: 'English fixture', SupportsExternalStream: true, IsExternal: true }] };
  const movie = { Id: 'original-movie', Name: 'Tatakai local fixture', Type: 'Movie', LocationType: 'File', ImageTags: {}, Overview: 'Original extension protocol fixture', MediaSources: [media], IndexNumber: 1 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push({ path: url.pathname, method: req.method, authenticated: req.headers.authorization?.includes(token) === true });
    const json = value => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/Users/AuthenticateByName') {
      let body = ''; for await (const bytes of req) { body += bytes; if (body.length > 8192) { res.writeHead(413); res.end(); return; } }
      try { const value = JSON.parse(body); assert.equal(value.Username, 'fixture'); assert(['', 'fixture-password'].includes(value.Pw)); }
      catch { res.writeHead(401); res.end(); return; }
      return json({ AccessToken: token, SessionInfo: { UserId: 'fixture-user' } });
    }
    if (!req.headers.authorization?.includes(token)) { res.writeHead(401); res.end(); return; }
    if (url.pathname === '/Users/fixture-user/Items') {
      return json({ Items: url.searchParams.has('Recursive') ? [movie] : [{ Id: 'fixture-library', Name: 'Fixture library', Type: 'CollectionFolder', LocationType: 'File', ImageTags: {}, CollectionType: 'movies' }], TotalRecordCount: 1 });
    }
    if (url.pathname === '/Users/fixture-user/Items/original-movie') return json(movie);
    if (url.pathname === '/Items/Filters') return json({ Genres: [], Tags: [], OfficialRatings: [], Years: [] });
    if (url.pathname === '/Items/original-movie/PlaybackInfo') return json({ MediaSources: [media], PlaySessionId: 'fixture-session' });
    if (url.pathname.endsWith('/Stream.vtt')) { res.writeHead(200, { 'Content-Type': 'text/vtt' }); res.end('WEBVTT\n\n00:00.000 --> 00:01.000\nLocal subtitle fixture\n'); return; }
    if (url.pathname === '/Videos/original-movie/stream') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex')); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, token, calls, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
