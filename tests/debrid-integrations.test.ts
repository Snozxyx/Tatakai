import { describe, expect, test } from 'bun:test';
import {
  resolveRealDebridMagnet,
  resolveTorboxMagnet,
} from '../src/core/providers/debrid-orchestrator';
import {
  RealDebridClient,
} from '../src/core/providers/realdebrid-client';
import {
  TorboxClient,
} from '../src/core/providers/torbox-client';
import type {
  DebridHttpRequest,
  DebridHttpResponse,
} from '../src/core/providers/debrid-http';

function response(status: number, body = ''): DebridHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    url: 'https://provider.test',
    headers: {},
    text: async () => body,
    json: async <T>() => JSON.parse(body) as T,
  };
}

describe('debrid provider flows', () => {
  test('Real-Debrid selects the matching API file id and accepts selectFiles 204', async () => {
    const requests: Array<{ url: string; body?: string }> = [];
    let infoCalls = 0;
    const request: DebridHttpRequest = async (url, init = {}) => {
      requests.push({ url, body: init.body });
      if (url.endsWith('/torrents/addMagnet')) return response(201, JSON.stringify({ id: 'rd-7' }));
      if (url.includes('/torrents/info/')) {
        infoCalls += 1;
        return response(200, JSON.stringify({
          id: 'rd-7',
          status: infoCalls === 1 ? 'waiting_files_selection' : 'downloaded',
          files: [
            { id: 41, path: '/Show S01E01.mkv', bytes: 900 },
            { id: 77, path: '/Show S01E02.mkv', bytes: 800 },
          ],
          links: infoCalls > 1 ? ['https://real-debrid.test/host-link'] : [],
        }));
      }
      if (url.includes('/torrents/selectFiles/')) return response(204);
      if (url.endsWith('/unrestrict/link')) {
        return response(200, JSON.stringify({
          download: 'https://cdn.real-debrid.test/Show.S01E02.mkv',
          filename: 'Show S01E02.mkv',
          filesize: 800,
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await resolveRealDebridMagnet(
      new RealDebridClient('rd-token', request),
      'magnet:?xt=urn:btih:ABC',
      { episodeNumber: 2, sleep: async () => undefined, maxPollAttempts: 2 },
    );

    expect(result.url).toBe('https://cdn.real-debrid.test/Show.S01E02.mkv');
    expect(requests.find((entry) => entry.url.includes('/selectFiles/'))?.body).toBe('files=77');
  });

  test('TorBox sends multipart magnet data and requests the matching concrete file id', async () => {
    const requests: Array<{ url: string; body?: string; contentType?: string }> = [];
    const request: DebridHttpRequest = async (url, init = {}) => {
      requests.push({
        url,
        body: init.body,
        contentType: init.headers?.['Content-Type'],
      });
      if (url.endsWith('/torrents/createtorrent')) {
        return response(200, JSON.stringify({ success: true, data: { torrent_id: 19 } }));
      }
      if (url.includes('/torrents/mylist?')) {
        return response(200, JSON.stringify({
          success: true,
          data: [{
            id: 19,
            download_present: true,
            download_state: 'cached',
            files: [
              { id: 3, short_name: 'Show S01E01.mkv', size: 900, mimetype: 'video/x-matroska' },
              { id: 8, short_name: 'Show S01E02.mkv', size: 800, mimetype: 'video/x-matroska' },
            ],
          }],
        }));
      }
      if (url.includes('/torrents/requestdl?')) {
        return response(200, JSON.stringify({
          success: true,
          data: 'https://cdn.torbox.test/Show.S01E02.mkv',
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await resolveTorboxMagnet(
      new TorboxClient('tb-token', request),
      'magnet:?xt=urn:btih:XYZ',
      { episodeNumber: 2, sleep: async () => undefined, maxPollAttempts: 1 },
    );

    const create = requests.find((entry) => entry.url.endsWith('/torrents/createtorrent'));
    expect(create?.contentType).toStartWith('multipart/form-data; boundary=');
    expect(create?.body).toContain('name="magnet"');
    expect(create?.body).toContain('magnet:?xt=urn:btih:XYZ');
    const download = requests.find((entry) => entry.url.includes('/torrents/requestdl?'));
    expect(download?.url).toContain('torrent_id=19');
    expect(download?.url).toContain('file_id=8');
    expect(result.url).toBe('https://cdn.torbox.test/Show.S01E02.mkv');
  });
});
