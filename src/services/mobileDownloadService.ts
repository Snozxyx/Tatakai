/**
 * Mobile Download Service - For Capacitor/Android ONLY
 * Simple, standalone download system with no Electron dependencies
 * 
 * Uses:
 * - @capacitor/file-transfer for direct downloads (background support, native performance)
 * - @capacitor/filesystem appendFile for HLS segments (chunked writing, low memory)
 * - @capawesome-team/capacitor-android-foreground-service for background processing
 * - @capacitor-community/keep-awake to prevent device sleep during downloads
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

export interface MobileDownload {
  id: string;
  animeId: string;
  animeTitle: string;
  season: number;
  episode: number;
  poster?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  progress: number;
  error?: string;
  speed?: string;
  eta?: string;
}

export interface OfflineEpisode {
  animeId: string;
  animeTitle: string;
  season: number;
  episode: number;
  poster?: string;
  videoPath: string;
  downloadedAt: string;
}

const DOWNLOAD_EVENT = 'mobile-download-update';
const QUEUE_KEY = 'tatakai_mobile_downloads';
const BASE_DIR = 'TatakaiOffline';
const NOTIFICATION_ID = 1001;

// Helper to log download events for debugging
const logDownload = (msg: string, data?: unknown) => {
  console.log(`[MobileDownload] ${msg}`, data || '');
};

class MobileDownloadService {
  private queue: MobileDownload[] = [];
  private isProcessing = false;
  private abortController: AbortController | null = null;
  private transferListener: { remove: () => Promise<void> } | null = null;
  private isForegroundServiceRunning = false;

  constructor() {
    this.loadQueue();
  }

  // ========== BACKGROUND SERVICE MANAGEMENT ==========

  private async startBackgroundService(title: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      // Keep device awake
      await KeepAwake.keepAwake();
      logDownload('KeepAwake enabled');

      // Start foreground service with notification
      if (!this.isForegroundServiceRunning) {
        await ForegroundService.startForegroundService({
          id: NOTIFICATION_ID,
          title: 'Downloading...',
          body: title,
          smallIcon: 'ic_notification',
          buttons: [
            {
              title: 'Cancel',
              id: 1,
            },
          ],
        });
        this.isForegroundServiceRunning = true;
        logDownload('Foreground service started');

        // Listen for button clicks
        ForegroundService.addListener('buttonClicked', async (event) => {
          if (event.buttonId === 1) {
            // Cancel button pressed
            const downloading = this.queue.find(d => d.status === 'downloading');
            if (downloading) {
              await this.cancel(downloading.id);
            }
          }
        });
      } else {
        // Update existing notification
        await ForegroundService.updateForegroundService({
          id: NOTIFICATION_ID,
          title: 'Downloading...',
          body: title,
        });
      }
    } catch (err) {
      logDownload('Failed to start background service', err);
    }
  }

  private async updateBackgroundNotification(title: string, progress: number): Promise<void> {
    if (!this.isForegroundServiceRunning) return;
    
    try {
      await ForegroundService.updateForegroundService({
        id: NOTIFICATION_ID,
        title: `Downloading ${progress}%`,
        body: title,
      });
    } catch (err) {
      // Ignore update errors
    }
  }

  private async stopBackgroundService(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      // Allow device to sleep
      await KeepAwake.allowSleep();
      logDownload('KeepAwake disabled');

      // Stop foreground service if no more downloads
      if (this.isForegroundServiceRunning && !this.queue.some(d => d.status === 'queued' || d.status === 'downloading')) {
        await ForegroundService.stopForegroundService();
        this.isForegroundServiceRunning = false;
        logDownload('Foreground service stopped');
      }
    } catch (err) {
      logDownload('Failed to stop background service', err);
    }
  }

  // ========== PUBLIC API ==========

  async download(params: {
    animeId: string;
    animeTitle: string;
    season: number;
    episode: number;
    videoUrl: string;
    poster?: string;
  }): Promise<string> {
    const id = `${params.animeId}-S${params.season}E${params.episode}`;

    logDownload('Starting download', { id, url: params.videoUrl.substring(0, 100) });

    // Check if already exists
    if (this.queue.find(d => d.id === id)) {
      throw new Error('Already in queue');
    }

    // Check if already downloaded
    if (await this.isDownloaded(params.animeId, params.season, params.episode)) {
      throw new Error('Already downloaded');
    }

    const item: MobileDownload = {
      id,
      animeId: params.animeId,
      animeTitle: params.animeTitle,
      season: params.season,
      episode: params.episode,
      poster: params.poster,
      status: 'queued',
      progress: 0,
    };

    // Store video URL for later
    localStorage.setItem(`dl_url_${id}`, params.videoUrl);

    this.queue.push(item);
    this.saveQueue();
    this.emit();
    this.process();

    return id;
  }

  async cancel(id: string): Promise<void> {
    logDownload('Cancelling download', { id });
    const item = this.queue.find(d => d.id === id);
    if (item?.status === 'downloading') {
      this.abortController?.abort();
      // Remove file transfer listener if exists
      if (this.transferListener) {
        await this.transferListener.remove();
        this.transferListener = null;
      }
    }
    this.queue = this.queue.filter(d => d.id !== id);
    localStorage.removeItem(`dl_url_${id}`);
    this.saveQueue();
    this.emit();
  }

  async retry(id: string): Promise<void> {
    const item = this.queue.find(d => d.id === id);
    if (item && item.status === 'failed') {
      item.status = 'queued';
      item.progress = 0;
      item.error = undefined;
      this.saveQueue();
      this.emit();
      this.process();
    }
  }

  getQueue(): MobileDownload[] {
    return [...this.queue];
  }

  getActive(): MobileDownload[] {
    return this.queue.filter(d => d.status === 'queued' || d.status === 'downloading');
  }

  // ========== OFFLINE LIBRARY ==========

  async getLibrary(): Promise<OfflineEpisode[]> {
    if (!Capacitor.isNativePlatform()) return [];

    try {
      const result = await Filesystem.readdir({
        path: BASE_DIR,
        directory: Directory.Data,
      });

      const episodes: OfflineEpisode[] = [];

      for (const dir of result.files) {
        if (dir.type !== 'directory') continue;

        try {
          const files = await Filesystem.readdir({
            path: `${BASE_DIR}/${dir.name}`,
            directory: Directory.Data,
          });

          for (const file of files.files) {
            if (file.name.endsWith('.json')) {
              try {
                const data = await Filesystem.readFile({
                  path: `${BASE_DIR}/${dir.name}/${file.name}`,
                  directory: Directory.Data,
                  encoding: Encoding.UTF8,
                });
                episodes.push(JSON.parse(data.data as string));
              } catch {}
            }
          }
        } catch {}
      }

      return episodes.sort((a, b) => 
        new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  async getVideoUrl(animeId: string, season: number, episode: number): Promise<string | null> {
    try {
      const safeName = this.sanitize(animeId);
      const manifestPath = `${BASE_DIR}/${safeName}/S${season}E${episode}.json`;

      const data = await Filesystem.readFile({
        path: manifestPath,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });

      const manifest = JSON.parse(data.data as string);
      const uri = await Filesystem.getUri({
        path: manifest.videoPath,
        directory: Directory.Data,
      });

      return Capacitor.convertFileSrc(uri.uri);
    } catch {
      return null;
    }
  }

  async deleteEpisode(animeId: string, season: number, episode: number): Promise<void> {
    const safeName = this.sanitize(animeId);
    const basePath = `${BASE_DIR}/${safeName}`;

    try {
      await Filesystem.deleteFile({
        path: `${basePath}/S${season}E${episode}.mp4`,
        directory: Directory.Data,
      });
    } catch {}

    try {
      await Filesystem.deleteFile({
        path: `${basePath}/S${season}E${episode}.json`,
        directory: Directory.Data,
      });
    } catch {}

    // Remove from queue too
    const id = `${animeId}-S${season}E${episode}`;
    this.queue = this.queue.filter(d => d.id !== id);
    this.saveQueue();
    this.emit();
  }

  async isDownloaded(animeId: string, season: number, episode: number): Promise<boolean> {
    try {
      const safeName = this.sanitize(animeId);
      await Filesystem.readFile({
        path: `${BASE_DIR}/${safeName}/S${season}E${episode}.json`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ========== INTERNAL ==========

  private async process() {
    if (this.isProcessing) return;

    const next = this.queue.find(d => d.status === 'queued');
    if (!next) {
      // No more downloads - stop background service
      await this.stopBackgroundService();
      return;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    next.status = 'downloading';
    next.progress = 0;
    this.saveQueue();
    this.emit();

    logDownload('Processing download', { id: next.id });

    // Start background service to keep app alive
    await this.startBackgroundService(`${next.animeTitle} S${next.season}E${next.episode}`);

    try {
      const videoUrl = localStorage.getItem(`dl_url_${next.id}`);
      if (!videoUrl) {
        throw new Error('No video URL found in storage');
      }

      logDownload('Video URL retrieved', { id: next.id, urlLength: videoUrl.length, urlStart: videoUrl.substring(0, 80) });

      await this.downloadVideo(next, videoUrl);

      next.status = 'completed';
      next.progress = 100;
      next.speed = undefined;
      next.eta = undefined;
      logDownload('Download completed successfully', { id: next.id });
      localStorage.removeItem(`dl_url_${next.id}`);

    } catch (err: unknown) {
      const error = err as Error;
      logDownload('Download failed', { id: next.id, error: error.message, name: error.name });
      
      if (error.name === 'AbortError') {
        // Cancelled - remove from queue
        this.queue = this.queue.filter(d => d.id !== next.id);
      } else {
        next.status = 'failed';
        next.error = error.message || 'Download failed';
        next.speed = undefined;
        next.eta = undefined;
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
      if (this.transferListener) {
        await this.transferListener.remove();
        this.transferListener = null;
      }
      this.saveQueue();
      this.emit();

      // Stop background service if no more downloads, or process next
      const hasMore = this.queue.some(d => d.status === 'queued');
      if (!hasMore) {
        await this.stopBackgroundService();
      }
      
      // Process next
      setTimeout(() => this.process(), 500);
    }
  }

  private async downloadVideo(item: MobileDownload, url: string): Promise<void> {
    const safeName = this.sanitize(item.animeId);
    const basePath = `${BASE_DIR}/${safeName}`;
    const videoPath = `${basePath}/S${item.season}E${item.episode}.mp4`;

    logDownload('Creating directory', { basePath });

    // Ensure directory
    try {
      await Filesystem.mkdir({
        path: basePath,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (e) {
      // Directory may already exist
      logDownload('mkdir result (may already exist)', e);
    }

    // Check if HLS or direct
    const isHLS = url.includes('.m3u8');
    logDownload('Download type', { isHLS, url: url.substring(0, 100) });

    if (isHLS) {
      await this.downloadHLS(item, url, videoPath);
    } else {
      await this.downloadDirect(item, url, videoPath);
    }

    logDownload('Writing manifest', { animeId: item.animeId });

    // Save manifest
    const manifest: OfflineEpisode = {
      animeId: item.animeId,
      animeTitle: item.animeTitle,
      season: item.season,
      episode: item.episode,
      poster: item.poster,
      videoPath,
      downloadedAt: new Date().toISOString(),
    };

    await Filesystem.writeFile({
      path: `${basePath}/S${item.season}E${item.episode}.json`,
      directory: Directory.Data,
      data: JSON.stringify(manifest),
      encoding: Encoding.UTF8,
      recursive: true,
    });
  }

  private async downloadHLS(item: MobileDownload, m3u8Url: string, outputPath: string): Promise<void> {
    const signal = this.abortController?.signal;

    logDownload('Fetching HLS playlist', { url: m3u8Url });

    // Fetch playlist
    const res = await fetch(m3u8Url, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch playlist: HTTP ${res.status}`);
    }

    const text = await res.text();
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    logDownload('Playlist fetched', { length: text.length, baseUrl });

    // Parse segments
    const lines = text.split('\n');
    const segments: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // If variant playlist, recurse to get the actual segments
      if (trimmed.endsWith('.m3u8')) {
        const variantUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        logDownload('Found variant playlist, recursing', { variantUrl });
        return this.downloadHLS(item, variantUrl, outputPath);
      }

      segments.push(trimmed.startsWith('http') ? trimmed : baseUrl + trimmed);
    }

    if (segments.length === 0) {
      throw new Error('No segments found in playlist');
    }

    logDownload('Parsed segments', { count: segments.length });

    // Create empty output file first
    await Filesystem.writeFile({
      path: outputPath,
      directory: Directory.Data,
      data: '',
      recursive: true,
    });

    // Download segments and append to file one by one (low memory usage)
    const total = segments.length;
    let totalBytes = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }

      const segUrl = segments[i];
      
      try {
        const segRes = await fetch(segUrl, { signal });
        if (!segRes.ok) {
          throw new Error(`Segment ${i + 1}/${total} failed: HTTP ${segRes.status}`);
        }

        const arrayBuffer = await segRes.arrayBuffer();
        const base64Data = this.arrayBufferToBase64(arrayBuffer);
        
        // Append directly to file (no memory accumulation)
        await Filesystem.appendFile({
          path: outputPath,
          directory: Directory.Data,
          data: base64Data,
        });

        totalBytes += arrayBuffer.byteLength;

        // Calculate speed every second
        const now = Date.now();
        if (now - lastTime >= 1000) {
          const timeDiff = (now - lastTime) / 1000;
          const byteDiff = totalBytes - lastBytes;
          const bytesPerSec = byteDiff / timeDiff;
          
          // Format speed
          if (bytesPerSec >= 1024 * 1024) {
            item.speed = `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
          } else {
            item.speed = `${Math.round(bytesPerSec / 1024)} KB/s`;
          }

          // Estimate ETA
          const segmentsRemaining = total - i - 1;
          const avgTimePerSegment = (now - lastTime) / 1000 / Math.max(1, i + 1);
          const etaSeconds = Math.round(segmentsRemaining * avgTimePerSegment);
          
          if (etaSeconds < 60) {
            item.eta = `${etaSeconds}s`;
          } else if (etaSeconds < 3600) {
            item.eta = `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`;
          } else {
            item.eta = `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`;
          }

          lastTime = now;
          lastBytes = totalBytes;
        }

        // Progress (leave 5% for manifest write)
        item.progress = Math.round(((i + 1) / total) * 95);
        this.emit();
        
        // Update background notification
        await this.updateBackgroundNotification(
          `${item.animeTitle} S${item.season}E${item.episode}`,
          item.progress
        );

      } catch (segErr) {
        if ((segErr as Error).name === 'AbortError') {
          throw segErr;
        }
        logDownload(`Segment ${i + 1} failed, retrying once...`, segErr);
        
        // Retry once
        const retryRes = await fetch(segUrl, { signal });
        if (!retryRes.ok) {
          throw new Error(`Segment ${i + 1}/${total} retry failed: HTTP ${retryRes.status}`);
        }
        
        const arrayBuffer = await retryRes.arrayBuffer();
        const base64Data = this.arrayBufferToBase64(arrayBuffer);
        
        await Filesystem.appendFile({
          path: outputPath,
          directory: Directory.Data,
          data: base64Data,
        });
        
        totalBytes += arrayBuffer.byteLength;
        item.progress = Math.round(((i + 1) / total) * 95);
        this.emit();
      }
    }

    logDownload('HLS download complete', { segments: total, totalBytes });
  }

  // Convert ArrayBuffer to base64 without loading into large Uint8Array
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK_SIZE = 0x8000; // 32KB chunks
    const parts: string[] = [];
    
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
      parts.push(String.fromCharCode.apply(null, Array.from(chunk)));
    }
    
    return btoa(parts.join(''));
  }

  private async downloadDirect(item: MobileDownload, url: string, outputPath: string): Promise<void> {
    logDownload('Starting direct download with FileTransfer', { url: url.substring(0, 100), outputPath });

    // Get the full file URI for the output path
    const fileUri = await Filesystem.getUri({
      path: outputPath,
      directory: Directory.Data,
    });

    logDownload('File URI resolved', { uri: fileUri.uri });

    let lastBytes = 0;
    let lastTime = Date.now();

    // Set up progress listener
    this.transferListener = await FileTransfer.addListener('progress', (progress) => {
      const now = Date.now();
      
      // Calculate speed
      if (now - lastTime >= 500) {
        const timeDiff = (now - lastTime) / 1000;
        const byteDiff = progress.bytes - lastBytes;
        const bytesPerSec = byteDiff / timeDiff;
        
        if (bytesPerSec >= 1024 * 1024) {
          item.speed = `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        } else {
          item.speed = `${Math.round(bytesPerSec / 1024)} KB/s`;
        }

        // Calculate ETA
        if (progress.contentLength > 0 && bytesPerSec > 0) {
          const remaining = progress.contentLength - progress.bytes;
          const seconds = Math.round(remaining / bytesPerSec);
          if (seconds < 60) {
            item.eta = `${seconds}s`;
          } else if (seconds < 3600) {
            item.eta = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
          } else {
            item.eta = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
          }
        }

        lastTime = now;
        lastBytes = progress.bytes;
      }

      // Progress (leave 5% for manifest write)
      if (progress.contentLength > 0) {
        item.progress = Math.round((progress.bytes / progress.contentLength) * 95);
        this.emit();
        
        // Update background notification
        this.updateBackgroundNotification(
          `${item.animeTitle} S${item.season}E${item.episode}`,
          item.progress
        );
      }
    });

    try {
      // Use native FileTransfer for background support
      await FileTransfer.downloadFile({
        url,
        path: fileUri.uri,
        progress: true,
      });

      logDownload('Direct download complete via FileTransfer');
    } catch (err) {
      logDownload('FileTransfer failed, falling back to fetch', err);
      
      // Fallback to fetch with chunked append
      await this.downloadDirectFallback(item, url, outputPath);
    }
  }

  // Fallback for when FileTransfer doesn't work (e.g., some HLS proxied URLs)
  private async downloadDirectFallback(item: MobileDownload, url: string, outputPath: string): Promise<void> {
    const signal = this.abortController?.signal;

    logDownload('Using fetch fallback for direct download');

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const reader = res.body?.getReader();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    // Create empty output file first
    await Filesystem.writeFile({
      path: outputPath,
      directory: Directory.Data,
      data: '',
      recursive: true,
    });

    let downloaded = 0;
    let lastTime = Date.now();
    let lastDownloaded = 0;

    // Read and write in chunks to avoid memory issues
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Download cancelled', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      // Append chunk directly to file
      const base64Data = this.arrayBufferToBase64(value.buffer);
      await Filesystem.appendFile({
        path: outputPath,
        directory: Directory.Data,
        data: base64Data,
      });

      downloaded += value.length;

      // Calculate speed and ETA every 500ms
      const now = Date.now();
      if (now - lastTime >= 500) {
        const timeDiff = (now - lastTime) / 1000;
        const byteDiff = downloaded - lastDownloaded;
        const bytesPerSec = byteDiff / timeDiff;
        
        if (bytesPerSec >= 1024 * 1024) {
          item.speed = `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
        } else {
          item.speed = `${Math.round(bytesPerSec / 1024)} KB/s`;
        }

        if (total > 0 && bytesPerSec > 0) {
          const remaining = total - downloaded;
          const seconds = Math.round(remaining / bytesPerSec);
          if (seconds < 60) {
            item.eta = `${seconds}s`;
          } else if (seconds < 3600) {
            item.eta = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
          } else {
            item.eta = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
          }
        }

        lastTime = now;
        lastDownloaded = downloaded;
      }

      if (total > 0) {
        item.progress = Math.round((downloaded / total) * 95);
        this.emit();
      }
    }

    logDownload('Fallback download complete', { totalBytes: downloaded });
  }

  // ========== HELPERS ==========

  private sanitize(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem(QUEUE_KEY);
      if (saved) {
        this.queue = JSON.parse(saved);
        // Reset stuck downloads - they need to restart
        let needsRestart = false;
        this.queue.forEach(d => {
          if (d.status === 'downloading') {
            d.status = 'queued';
            d.progress = 0;
            d.speed = undefined;
            d.eta = undefined;
            needsRestart = true;
          }
        });
        
        // Remove completed items from queue (they're in the library)
        this.queue = this.queue.filter(d => d.status !== 'completed');
        
        this.saveQueue();
        
        // Auto-resume queued downloads after a short delay
        if (needsRestart || this.queue.some(d => d.status === 'queued')) {
          setTimeout(() => {
            this.emit();
            this.process();
          }, 1000);
        }
      }
    } catch {}
  }

  private saveQueue() {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
  }

  private emit() {
    window.dispatchEvent(new CustomEvent(DOWNLOAD_EVENT, { detail: this.queue }));
  }
}

// Singleton
export const mobileDownloadService = new MobileDownloadService();
export const MOBILE_DOWNLOAD_UPDATE = DOWNLOAD_EVENT;
