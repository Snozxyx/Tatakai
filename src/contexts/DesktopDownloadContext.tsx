/**
 * Desktop Download Context - For Electron app ONLY
 * This handles downloads via Electron's IPC
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { fetchCombinedSources, getProxiedVideoUrl } from '@/lib/api';

interface DownloadState {
    progress: number;
    status: 'idle' | 'queued' | 'downloading' | 'completed' | 'error';
    error?: string;
    animeName?: string;
    episodeNumber?: number;
    posterUrl?: string;
    speed?: string;
    eta?: string;
}

interface DesktopDownloadContextType {
    downloadStates: Record<string, DownloadState>;
    startDownload: (params: {
        episodeId: string,
        animeName: string,
        episodeNumber: number,
        posterUrl: string,
    }) => Promise<void>;
    cancelDownload: (episodeId: string) => Promise<void>;
    clearCompleted: () => void;
}

const DesktopDownloadContext = createContext<DesktopDownloadContextType | null>(null);

export function DesktopDownloadProvider({ children }: { children: React.ReactNode }) {
    const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

    // Only set up listeners if electron is available
    useEffect(() => {
        const electron = (window as any).electron;
        if (!electron) return;

        electron.onDownloadProgress((data: { 
            episodeId: string, 
            percent: number,
            speed?: string,
            eta?: string,
        }) => {
            setDownloadStates(prev => {
                const current = prev[data.episodeId];
                if (!current) return prev; 
                return {
                    ...prev,
                    [data.episodeId]: {
                        ...current,
                        progress: data.percent,
                        status: 'downloading',
                        speed: data.speed,
                        eta: data.eta,
                    }
                };
            });
        });

        if (electron.onDownloadCompleted) {
            electron.onDownloadCompleted(({ episodeId }: { episodeId: string }) => {
                setDownloadStates(prev => {
                    const current = prev[episodeId];
                    if (!current) return prev;
                    toast.success(`Download completed: ${current.animeName} - Episode ${current.episodeNumber}`);
                    return {
                        ...prev,
                        [episodeId]: { ...current, progress: 100, status: 'completed' }
                    };
                });
            });
        }

        if (electron.onDownloadError) {
            electron.onDownloadError(({ episodeId, error }: { episodeId: string, error: string }) => {
                setDownloadStates(prev => {
                    const current = prev[episodeId];
                    if (!current) return prev;
                    toast.error(`Download failed: ${current.animeName}`);
                    return {
                        ...prev,
                        [episodeId]: { ...current, status: 'error', error }
                    };
                });
            });
        }
    }, []);

    const startDownload = useCallback(async (params: {
        episodeId: string,
        animeName: string,
        episodeNumber: number,
        posterUrl: string,
    }) => {
        const electron = (window as any).electron;
        if (!electron) {
            toast.error('Downloads only available in desktop app');
            return;
        }

        const { episodeId, animeName, episodeNumber, posterUrl } = params;

        setDownloadStates(prev => ({
            ...prev,
            [episodeId]: { progress: 0, status: 'queued', animeName, episodeNumber, posterUrl }
        }));

        try {
            const sources = await fetchCombinedSources(episodeId, animeName, episodeNumber, 'hd-2', 'sub');
            const bestSource = sources.sources[0];
            if (!bestSource?.url) throw new Error('No source found');

            const rawTracks = sources.tracks || sources.subtitles || [];
            const subtitles = rawTracks
                .filter((t: any) => t.lang && t.lang.toLowerCase() !== 'thumbnails')
                .map((s: any) => ({ lang: s.lang, url: s.url }));

            const savedPath = localStorage.getItem('tatakai_download_path');
            const downloadPath = savedPath || await electron.getDownloadsDir();
            const proxiedUrl = getProxiedVideoUrl(bestSource.url, sources.headers?.Referer, sources.headers?.["User-Agent"]);

            const result = await electron.startDownload({
                episodeId,
                animeName,
                episodeNumber,
                url: proxiedUrl,
                headers: proxiedUrl !== bestSource.url ? {} : sources.headers,
                downloadPath,
                posterUrl,
                subtitles
            });

            if (!result.success) throw new Error(result.error);
            toast.info(`Download started: ${animeName} - Episode ${episodeNumber}`);
        } catch (error: any) {
            setDownloadStates(prev => ({
                ...prev,
                [episodeId]: { ...prev[episodeId], status: 'error', error: error.message }
            }));
            toast.error(`Failed: ${error.message}`);
        }
    }, []);

    const cancelDownload = useCallback(async (episodeId: string) => {
        const electron = (window as any).electron;
        if (!electron) return;
        await electron.cancelDownload({ episodeId });
        setDownloadStates(prev => {
            const next = { ...prev };
            delete next[episodeId];
            return next;
        });
    }, []);

    const clearCompleted = useCallback(() => {
        setDownloadStates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
                if (next[k].status === 'completed') delete next[k];
            });
            return next;
        });
    }, []);

    return (
        <DesktopDownloadContext.Provider value={{ downloadStates, startDownload, cancelDownload, clearCompleted }}>
            {children}
        </DesktopDownloadContext.Provider>
    );
}

export function useDesktopDownload() {
    const ctx = useContext(DesktopDownloadContext);
    if (!ctx) {
        // Return no-op functions when not in desktop context
        return {
            downloadStates: {},
            startDownload: async () => {},
            cancelDownload: async () => {},
            clearCompleted: () => {},
        };
    }
    return ctx;
}
