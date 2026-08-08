import { DebridUnrestrictResult } from './realdebrid-client';

/**
 * TorBox API Client
 * Docs: https://torbox.app/api
 */
export class TorboxClient {
  private apiKey: string;
  private baseUrl = 'https://api.torbox.app/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TorBox API Error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    if (json.success === false) {
        throw new Error(`TorBox API Error: ${json.error || json.detail || 'Unknown error'}`);
    }
    
    return json.data || json;
  }

  /**
   * Add a magnet link to TorBox
   */
  async addMagnet(magnet: string): Promise<string> {
    const formData = new URLSearchParams();
    formData.append('magnet', magnet);

    const data = await this.fetchApi('/api/torrents/createtorrent', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return data.torrent_id?.toString();
  }

  /**
   * Get torrent info to retrieve the download link
   */
  async getTorrentInfo(id: string): Promise<any> {
    return this.fetchApi(`/api/torrents/mylist?id=${id}`);
  }

  /**
   * Unrestrict/fetch the direct streaming URL
   */
  async unrestrictLink(torrentId: string, fileId: string): Promise<DebridUnrestrictResult> {
    const data = await this.fetchApi(`/api/torrents/requestdl?token=${this.apiKey}&torrent_id=${torrentId}&file_id=${fileId}`);
    
    return {
      url: data.url || data, // Torbox usually returns the direct string or an object with url
      filename: `torbox_${torrentId}_${fileId}.mp4`,
      mimeType: 'video/mp4',
      filesize: 0,
    };
  }
}
