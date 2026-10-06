import {
  debridHttpRequest,
  type DebridHttpRequest,
  type DebridHttpRequestInit,
} from './debrid-http';

export type DebridProvider = 'realdebrid' | 'torbox';

export interface DebridAccount {
  provider: DebridProvider;
  apiKey: string;
  isActive: boolean;
}

export interface DebridUnrestrictResult {
  url: string;
  filename: string;
  mimeType: string;
  filesize: number;
}

export interface RealDebridFile {
  id: number;
  path: string;
  bytes: number;
  selected?: number;
}

export interface RealDebridTorrentInfo {
  id: string;
  filename?: string;
  status: string;
  files?: RealDebridFile[];
  links?: string[];
  progress?: number;
}

export class DebridApiError extends Error {
  readonly status: number;
  readonly provider: DebridProvider;

  constructor(provider: DebridProvider, status: number, detail: string) {
    super(`${provider === 'torbox' ? 'TorBox' : 'Real-Debrid'} API Error (${status}): ${detail}`);
    this.name = 'DebridApiError';
    this.status = status;
    this.provider = provider;
  }
}

function parseJson(text: string): any {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorDetail(body: any, fallback: string): string {
  return String(body?.error || body?.error_code || body?.detail || fallback || 'Unknown error');
}

/**
 * Real-Debrid API Client
 * Docs: https://api.real-debrid.com/
 */
export class RealDebridClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.real-debrid.com/rest/1.0';
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
    const data = parseJson(text);

    if (!response.ok) {
      throw new DebridApiError(
        'realdebrid',
        response.status,
        errorDetail(data, text || response.statusText),
      );
    }

    // selectFiles succeeds with 204 and an intentionally empty body. The old
    // unconditional response.json() turned that success into a parse failure.
    return data as T;
  }

  /** Validate a token against the documented authenticated account endpoint. */
  async verifyToken(): Promise<Record<string, unknown>> {
    return this.fetchApi<Record<string, unknown>>('/user');
  }

  /** Add a magnet link and return the newly-created torrent ID. */
  async addMagnet(magnet: string): Promise<string> {
    const body = new URLSearchParams({ magnet }).toString();
    const data = await this.fetchApi<{ id?: string }>('/torrents/addMagnet', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const id = String(data?.id || '').trim();
    if (!id) throw new Error('Real-Debrid did not return a torrent ID');
    return id;
  }

  async getTorrentInfo(id: string): Promise<RealDebridTorrentInfo> {
    return this.fetchApi<RealDebridTorrentInfo>(`/torrents/info/${encodeURIComponent(id)}`);
  }

  /** Select files to start the download on Real-Debrid. */
  async selectFiles(id: string, fileIds: Array<string | number>): Promise<void> {
    const files = fileIds.map(String).filter(Boolean);
    if (!files.length) throw new Error('No Real-Debrid file IDs were selected');
    const body = new URLSearchParams({ files: files.join(',') }).toString();

    await this.fetchApi(`/torrents/selectFiles/${encodeURIComponent(id)}`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  /** Unrestrict a generated host link into a direct stream URL. */
  async unrestrictLink(link: string): Promise<DebridUnrestrictResult> {
    const body = new URLSearchParams({ link }).toString();
    const data = await this.fetchApi<any>('/unrestrict/link', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const url = String(data?.download || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('Real-Debrid did not return a playable download URL');
    }

    return {
      url,
      filename: String(data?.filename || ''),
      mimeType: String(data?.mimeType || data?.mime_type || 'application/octet-stream'),
      filesize: Number(data?.filesize) || 0,
    };
  }
}
