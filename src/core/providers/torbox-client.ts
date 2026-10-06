import {
  DebridApiError,
  type DebridUnrestrictResult,
} from './realdebrid-client';
import {
  debridHttpRequest,
  type DebridHttpRequest,
  type DebridHttpRequestInit,
} from './debrid-http';

export interface TorboxTorrentFile {
  id: number | string;
  name?: string;
  short_name?: string;
  absolute_path?: string;
  mimetype?: string;
  mime_type?: string;
  size?: number;
}

export interface TorboxTorrentInfo {
  id: number | string;
  name?: string;
  hash?: string;
  download_state?: string;
  download_present?: boolean;
  download_finished?: boolean;
  cached?: boolean;
  progress?: number;
  files?: TorboxTorrentFile[];
  error?: string | null;
}

interface TorboxEnvelope<T> {
  success?: boolean;
  error?: string | null;
  detail?: string | null;
  data?: T;
}

export function createMultipartBody(fields: Record<string, string>): {
  body: string;
  contentType: string;
} {
  const boundary = `----TatakaiDebrid${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (/[\r\n"]/.test(name)) throw new Error('Invalid multipart field name');
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
      `${String(value)}\r\n`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return {
    body: parts.join(''),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * TorBox API Client
 * Docs: https://api-docs.torbox.app/
 */
export class TorboxClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.torbox.app/v1';
  private readonly request: DebridHttpRequest;

  constructor(apiKey: string, request: DebridHttpRequest = debridHttpRequest) {
    this.apiKey = apiKey.trim();
    this.request = request;
  }

  private async fetchApi<T = any>(endpoint: string, options: DebridHttpRequestInit = {}): Promise<T> {
    const response = await this.request(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...options.headers,
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const text = await response.text();
    let json: TorboxEnvelope<T> | null = null;
    if (text.trim()) {
      try {
        json = JSON.parse(text) as TorboxEnvelope<T>;
      } catch {
        json = null;
      }
    }

    if (!response.ok || json?.success === false) {
      const detail = String(json?.detail || json?.error || text || response.statusText || 'Unknown error');
      throw new DebridApiError('torbox', response.status, detail);
    }
    if (!json) throw new Error('TorBox returned an empty or invalid response');
    return (Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json) as T;
  }

  /** Validate a token without creating or querying a fake torrent. */
  async verifyToken(): Promise<Record<string, unknown>> {
    return this.fetchApi<Record<string, unknown>>('/api/user/me?settings=false');
  }

  /** Add a magnet link to TorBox and return its account-local torrent ID. */
  async addMagnet(magnet: string): Promise<string> {
    const multipart = createMultipartBody({ magnet });
    const data = await this.fetchApi<{ torrent_id?: number | string; id?: number | string }>(
      '/api/torrents/createtorrent',
      {
        method: 'POST',
        body: multipart.body,
        headers: { 'Content-Type': multipart.contentType },
      },
    );
    const id = String(data?.torrent_id ?? data?.id ?? '').trim();
    if (!id) throw new Error('TorBox did not return a torrent ID');
    return id;
  }

  /** List torrents (used for hash-dedupe before creating duplicates). */
  async listTorrents(bypassCache = true): Promise<TorboxTorrentInfo[]> {
    const query = new URLSearchParams();
    if (bypassCache) query.set('bypass_cache', 'true');
    const qs = query.toString();
    const data = await this.fetchApi<TorboxTorrentInfo | TorboxTorrentInfo[]>(
      `/api/torrents/mylist${qs ? `?${qs}` : ''}`,
    );
    if (Array.isArray(data)) return data;
    return data ? [data] : [];
  }

  /** Get fresh torrent state; bypass_cache is essential while polling. */
  async getTorrentInfo(id: string, bypassCache = true): Promise<TorboxTorrentInfo | null> {
    const query = new URLSearchParams({ id });
    if (bypassCache) query.set('bypass_cache', 'true');
    const data = await this.fetchApi<TorboxTorrentInfo | TorboxTorrentInfo[]>(
      `/api/torrents/mylist?${query.toString()}`,
    );
    if (Array.isArray(data)) {
      // Never fall back to data[0]: right after createtorrent the list is
      // eventually consistent and index 0 is often a DIFFERENT torrent, which
      // resolved/unrestricted the wrong episode. Null => keep polling.
      return data.find((item) => String(item?.id) === String(id)) || null;
    }
    // Single-object shape: only accept it when the id matches.
    if (data && String((data as TorboxTorrentInfo).id || '') === String(id)) return data as TorboxTorrentInfo;
    return data || null;
  }

  /** Request TorBox's temporary CDN URL for one concrete file. */
  async unrestrictLink(
    torrentId: string,
    fileId: string | number,
    filename = '',
  ): Promise<DebridUnrestrictResult> {
    const query = new URLSearchParams({
      // TorBox explicitly requires token in this endpoint's query parameters.
      token: this.apiKey,
      torrent_id: String(torrentId),
      file_id: String(fileId),
      redirect: 'false',
      append_name: 'true',
    });
    const data = await this.fetchApi<string | { url?: string }>(
      `/api/torrents/requestdl?${query.toString()}`,
    );
    const url = String(typeof data === 'string' ? data : data?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('TorBox did not return a playable download URL');
    }

    return {
      url,
      filename: filename || `torbox_${torrentId}_${fileId}`,
      mimeType: 'application/octet-stream',
      filesize: 0,
    };
  }
}
