/**
 * Mobile Cache Service
 * Provides intelligent caching for the mobile app with
 * persistent storage, image caching, and API response caching
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheConfig {
  maxSize: number; // MB
  defaultTTL: number; // milliseconds
  imageMaxAge: number; // milliseconds
}

class MobileCacheService {
  private static instance: MobileCacheService;
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private imageCache: Map<string, string> = new Map(); // blob URLs
  private config: CacheConfig;
  private cacheDir = 'TatakaiCache';
  private initialized = false;

  private constructor() {
    // Load config from localStorage
    const savedConfig = this.loadConfig();
    this.config = {
      maxSize: savedConfig?.cacheSize || 500,
      defaultTTL: 30 * 60 * 1000, // 30 minutes
      imageMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  static getInstance(): MobileCacheService {
    if (!MobileCacheService.instance) {
      MobileCacheService.instance = new MobileCacheService();
    }
    return MobileCacheService.instance;
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('tatakai_mobile_config');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  async init(): Promise<void> {
    if (this.initialized || !Capacitor.isNativePlatform()) return;

    try {
      // Create cache directory
      await Filesystem.mkdir({
        path: this.cacheDir,
        directory: Directory.Cache,
        recursive: true,
      }).catch(() => {}); // Ignore if exists

      // Load persistent cache index
      await this.loadCacheIndex();
      
      // Cleanup expired entries
      await this.cleanup();
      
      this.initialized = true;
      console.log('[MobileCache] Initialized');
    } catch (e) {
      console.error('[MobileCache] Init failed:', e);
    }
  }

  private async loadCacheIndex(): Promise<void> {
    try {
      const result = await Filesystem.readFile({
        path: `${this.cacheDir}/index.json`,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      
      const index = JSON.parse(result.data as string);
      for (const [key, entry] of Object.entries(index)) {
        this.memoryCache.set(key, entry as CacheEntry<any>);
      }
    } catch {
      // No index file yet, that's fine
    }
  }

  private async saveCacheIndex(): Promise<void> {
    try {
      const index: Record<string, CacheEntry<any>> = {};
      this.memoryCache.forEach((value, key) => {
        // Only persist API responses, not large data
        if (key.startsWith('api:') && value.data) {
          index[key] = value;
        }
      });

      await Filesystem.writeFile({
        path: `${this.cacheDir}/index.json`,
        directory: Directory.Cache,
        data: JSON.stringify(index),
        encoding: Encoding.UTF8,
      });
    } catch (e) {
      console.error('[MobileCache] Failed to save index:', e);
    }
  }

  // ============ API Response Caching ============

  async get<T>(key: string): Promise<T | null> {
    const entry = this.memoryCache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + (ttl || this.config.defaultTTL),
    };
    
    this.memoryCache.set(key, entry);
    
    // Debounced save to disk
    this.debouncedSave();
  }

  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private debouncedSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveCacheIndex();
    }, 2000);
  }

  // ============ Image Caching ============

  async cacheImage(url: string): Promise<string> {
    // Return cached blob URL if available
    const cached = this.imageCache.get(url);
    if (cached) return cached;

    // On web, just return the URL
    if (!Capacitor.isNativePlatform()) return url;

    try {
      // Generate filename from URL hash
      const filename = await this.hashString(url);
      const imagePath = `${this.cacheDir}/images/${filename}`;

      // Check if already cached on disk
      try {
        const stat = await Filesystem.stat({
          path: imagePath,
          directory: Directory.Cache,
        });
        
        // Check if not too old
        const age = Date.now() - (stat.mtime || 0);
        if (age < this.config.imageMaxAge) {
          const result = await Filesystem.readFile({
            path: imagePath,
            directory: Directory.Cache,
          });
          
          const blobUrl = `data:image/jpeg;base64,${result.data}`;
          this.imageCache.set(url, blobUrl);
          return blobUrl;
        }
      } catch {
        // Not cached yet
      }

      // Fetch and cache the image
      const response = await fetch(url);
      if (!response.ok) return url;

      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);

      // Ensure images directory exists
      await Filesystem.mkdir({
        path: `${this.cacheDir}/images`,
        directory: Directory.Cache,
        recursive: true,
      }).catch(() => {});

      await Filesystem.writeFile({
        path: imagePath,
        directory: Directory.Cache,
        data: base64,
      });

      const blobUrl = `data:image/jpeg;base64,${base64}`;
      this.imageCache.set(url, blobUrl);
      return blobUrl;
    } catch (e) {
      console.warn('[MobileCache] Image cache failed:', e);
      return url;
    }
  }

  // Preload images for smoother scrolling
  async preloadImages(urls: string[]): Promise<void> {
    // Limit concurrent preloads
    const batch = urls.slice(0, 10);
    await Promise.all(batch.map(url => this.cacheImage(url).catch(() => {})));
  }

  // ============ Anime Data Caching ============

  async cacheAnimeData(animeId: string, data: any): Promise<void> {
    await this.set(`anime:${animeId}`, data, 60 * 60 * 1000); // 1 hour
  }

  async getAnimeData(animeId: string): Promise<any | null> {
    return this.get(`anime:${animeId}`);
  }

  async cacheEpisodes(animeId: string, episodes: any[]): Promise<void> {
    await this.set(`episodes:${animeId}`, episodes, 30 * 60 * 1000); // 30 min
  }

  async getEpisodes(animeId: string): Promise<any[] | null> {
    return this.get(`episodes:${animeId}`);
  }

  async cacheSources(episodeId: string, sources: any): Promise<void> {
    await this.set(`sources:${episodeId}`, sources, 15 * 60 * 1000); // 15 min
  }

  async getSources(episodeId: string): Promise<any | null> {
    return this.get(`sources:${episodeId}`);
  }

  // ============ Cleanup & Management ============

  async cleanup(): Promise<void> {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }

    // Clean image cache if too old
    if (Capacitor.isNativePlatform()) {
      try {
        const files = await Filesystem.readdir({
          path: `${this.cacheDir}/images`,
          directory: Directory.Cache,
        });

        for (const file of files.files) {
          const age = Date.now() - (file.mtime || 0);
          if (age > this.config.imageMaxAge) {
            await Filesystem.deleteFile({
              path: `${this.cacheDir}/images/${file.name}`,
              directory: Directory.Cache,
            }).catch(() => {});
          }
        }
      } catch {
        // Images dir might not exist
      }
    }

    await this.saveCacheIndex();
  }

  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    this.imageCache.clear();

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.rmdir({
          path: this.cacheDir,
          directory: Directory.Cache,
          recursive: true,
        });
      } catch {
        // Might not exist
      }
    }

    // Clear localStorage cache keys
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('tatakai_cache_') || key.startsWith('anime_cache_')) {
        localStorage.removeItem(key);
      }
    });

    console.log('[MobileCache] Cleared all cache');
  }

  async getCacheSize(): Promise<{ used: number; limit: number }> {
    let size = 0;

    // Memory cache size (approximate)
    this.memoryCache.forEach((entry) => {
      size += JSON.stringify(entry).length;
    });

    // Disk cache size
    if (Capacitor.isNativePlatform()) {
      try {
        const readDir = async (path: string): Promise<number> => {
          let total = 0;
          const files = await Filesystem.readdir({
            path,
            directory: Directory.Cache,
          });
          
          for (const file of files.files) {
            if (file.type === 'directory') {
              total += await readDir(`${path}/${file.name}`);
            } else {
              total += file.size || 0;
            }
          }
          return total;
        };

        size += await readDir(this.cacheDir);
      } catch {
        // Cache dir might not exist
      }
    }

    return {
      used: Math.round(size / (1024 * 1024)), // MB
      limit: this.config.maxSize,
    };
  }

  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // ============ Utilities ============

  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data URL prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const mobileCache = MobileCacheService.getInstance();
