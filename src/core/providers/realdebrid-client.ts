export interface DebridAccount {
  provider: 'realdebrid' | 'torbox';
  apiKey: string;
  isActive: boolean;
}

export interface DebridUnrestrictResult {
  url: string;
  filename: string;
  mimeType: string;
  filesize: number;
}

/**
 * Real-Debrid API Client
 * Docs: https://api.real-debrid.com/
 */
export class RealDebridClient {
  private apiKey: string;
  private baseUrl = 'https://api.real-debrid.com/rest/1.0';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Real-Debrid API Error (${response.status}): ${errorText}`);
    }

    // Unrestrict returns JSON, others might too
    return response.json();
  }

  /**
   * Adds a magnet link to Real-Debrid and returns the torrent ID
   */
  async addMagnet(magnet: string): Promise<string> {
    const formData = new URLSearchParams();
    formData.append('magnet', magnet);

    const data = await this.fetchApi('/torrents/addMagnet', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return data.id;
  }

  /**
   * Gets details of a torrent, including file IDs
   */
  async getTorrentInfo(id: string): Promise<any> {
    return this.fetchApi(`/torrents/info/${id}`);
  }

  /**
   * Selects files to start the download on RD servers
   */
  async selectFiles(id: string, fileIds: string[]): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('files', fileIds.join(','));

    await this.fetchApi(`/torrents/selectFiles/${id}`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Unrestricts a generated host link to yield a direct download/stream URL
   */
  async unrestrictLink(link: string): Promise<DebridUnrestrictResult> {
    const formData = new URLSearchParams();
    formData.append('link', link);

    const data = await this.fetchApi('/unrestrict/link', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return {
      url: data.download,
      filename: data.filename,
      mimeType: data.mimeType,
      filesize: data.filesize,
    };
  }
}
