import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { toast } from 'sonner';
import { fetchCombinedSources, getProxiedVideoUrl, getProxiedSubtitleUrl } from '@/lib/api';

interface DownloadState {
    progress: number;
    status: 'idle' | 'queued' | 'downloading' | 'completed' | 'error';
    error?: string;
    animeName?: string;
    episodeNumber?: number;
    posterUrl?: string;
    speed?: string;
    eta?: string;
    downloaded?: string;
    elapsed?: string;
    animePath?: string; // Path to anime folder for cleanup
}

interface DownloadContextType {
    downloadStates: Record<string, DownloadState>;
    startDownload: (params: {
        episodeId: string,
        animeName: string,
        episodeNumber: number,
        posterUrl: string,
    }) => Promise<void>;
    cancelDownload: (episodeId: string) => Promise<void>;
    retryDownload: (episodeId: string) => Promise<void>;
    clearCompleted: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
    const isNative = useIsNativeApp();
    const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});

    useEffect(() => {
        if (typeof window !== 'undefined' && (window as any).electron) {
            const electron = (window as any).electron;

            electron.onDownloadProgress((data: { 
                episodeId: string, 
                percent: number,
                speed?: string,
                eta?: string,
                downloaded?: string,
                elapsed?: string
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
                            speed: data.speed || current.speed,
                            eta: data.eta || current.eta,
                            downloaded: data.downloaded || current.downloaded,
                            elapsed: data.elapsed || current.elapsed
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
                        
                        // Native Notification
                        electron.notify({
                            title: 'Download Complete',
                            body: `${current.animeName} - Episode ${current.episodeNumber} is ready for offline viewing.`
                        });

                        return {
                            ...prev,
                            [episodeId]: {
                                ...current,
                                progress: 100,
                                status: 'completed'
                            }
                        };
                    });
                });
            }

            if (electron.onDownloadError) {
                electron.onDownloadError(({ episodeId, error }: { episodeId: string, error: string }) => {
                    setDownloadStates(prev => {
                        const current = prev[episodeId];
                        if (!current) return prev;
                        toast.error(`Download failed: ${current.animeName} - Episode ${current.episodeNumber}`);
                        return {
                            ...prev,
                            [episodeId]: {
                                ...current,
                                status: 'error',
                                error
                            }
                        };
                    });
                });
            }
        }
    }, []);

    const startDownload = useCallback(async (params: {
        episodeId: string,
        animeName: string,
        episodeNumber: number,
        posterUrl: string,
    }) => {
        if (!isNative) {
            toast.error('Downloads are only available in the native app.');
            return;
        }

        const { episodeId, animeName, episodeNumber, posterUrl } = params;

        setDownloadStates(prev => ({
            ...prev,
            [episodeId]: { 
                progress: 0, 
                status: 'queued', // Initial state
                animeName,
                episodeNumber,
                posterUrl
            }
        }));

        try {
            // 1. Get Sources (Prefer HD-2 and SUB as requested)
            const sources = await fetchCombinedSources(episodeId, animeName, episodeNumber, 'hd-2', 'sub');

            const bestSource = sources.sources[0]; // Assuming hd-2 is returned first or filtered
            if (!bestSource || !bestSource.url) {
                throw new Error('No compatible streaming source found for download.');
            }

            // 2. Get Download Dir (prefer custom setup path)
            const savedPath = localStorage.getItem('tatakai_download_path');
            const downloadPath = savedPath || await (window as any).electron.getDownloadsDir();
            const sanitizedAnimeName = animeName.replace(/[<>:"/\\|?*]/g, '');
            const animePath = `${downloadPath}/${sanitizedAnimeName}`;

            // Update with animePath
            setDownloadStates(prev => ({
                ...prev,
                [episodeId]: { 
                    ...prev[episodeId],
                    animePath // Store for cleanup
                }
            }));

            // 3. Prepare Proxy URL
            // This is crucial: Use the backend proxy (rapid-service) to handle Referer/User-Agent.
            // This gives FFmpeg a clean URL without needing command-line headers, preventing "Invalid argument" errors on Windows.
            const proxiedUrl = getProxiedVideoUrl(bestSource.url, sources.headers?.Referer, sources.headers?.["User-Agent"]);
            
            // If proxying happens, we don't need to pass headers to Electron/FFmpeg.
            // If proxy is skipped (e.g. env var missing), we fallback to original URL + headers.
            const isProxied = proxiedUrl !== bestSource.url;
            const downloadUrl = proxiedUrl;
            const downloadHeaders = isProxied ? {} : sources.headers;

            // 4. Collect subtitles for download (API returns 'tracks' array)
            // Filter out thumbnail tracks and only keep actual subtitles
            const rawTracks = sources.tracks || sources.subtitles || [];
            const subtitlesToDownload = rawTracks.filter((track: any) => 
                track.lang && track.lang.toLowerCase() !== 'thumbnails'
            );
            
            console.log('Raw tracks from API:', rawTracks);
            console.log('Filtered subtitles (no thumbnails):', subtitlesToDownload);
            
            // For desktop app: Don't proxy subtitles (no CORS in Electron)
            // For web app: Proxy subtitles to handle CORS
            const allSubtitles = subtitlesToDownload
                .filter((sub: any, index: number, self: any[]) => 
                    // Remove duplicates based on language and URL
                    index === self.findIndex(s => s.lang === sub.lang && s.url === sub.url)
                )
                .map((sub: any) => ({
                    ...sub,
                    // Use direct URL for desktop (no CORS), no need to proxy
                    url: sub.url
                }));
            
            console.log('Final subtitles for download (direct URLs):', allSubtitles);

            // 5. Start Electron Download
            const result = await (window as any).electron.startDownload({
                episodeId,
                animeName,
                episodeNumber,
                url: downloadUrl,
                headers: downloadHeaders,
                downloadPath,
                posterUrl,
                subtitles: allSubtitles  // Pass all collected and proxied subtitles
            });

            if (result.success) {
                setDownloadStates(prev => ({
                    ...prev,
                    [episodeId]: { 
                        ...prev[episodeId], 
                        status: result.status === 'queued' ? 'queued' : 'downloading'
                    }
                }));
                
                if (result.status === 'queued') {
                    toast.info(`Queued: ${animeName} - Episode ${episodeNumber}`);
                } else {
                    toast.info(`Starting download: ${animeName} - Episode ${episodeNumber}`);
                }
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error: any) {
            console.error('Download start error:', error);
            setDownloadStates(prev => ({
                ...prev,
                [episodeId]: { 
                    ...prev[episodeId], 
                    status: 'error',
                    error: error.message 
                }
            }));
            toast.error(`Failed to start download: ${error.message}`);
        }
    }, [isNative]);

    const cancelDownload = useCallback(async (episodeId: string) => {
        if (!isNative) return;
        const state = downloadStates[episodeId];
        const animePath = state?.animePath; // Get animePath from state if available
        
        await (window as any).electron.cancelDownload({ episodeId, animePath });
        setDownloadStates(prev => {
            const next = { ...prev };
            delete next[episodeId];
            return next;
        });
    }, [isNative, downloadStates]);

    const retryDownload = useCallback(async (episodeId: string) => {
        const state = downloadStates[episodeId];
        if (!state || !isNative) return;

        // Re-trigger download with saved params
        await startDownload({
            episodeId,
            animeName: state.animeName || 'Unknown',
            episodeNumber: state.episodeNumber || 0,
            posterUrl: state.posterUrl || '',
        });
    }, [downloadStates, isNative, startDownload]);

    const clearCompleted = useCallback(() => {
        setDownloadStates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => {
                if (next[key].status === 'completed') {
                    delete next[key];
                }
            });
            return next;
        });
    }, []);

    return (
        <DownloadContext.Provider value={{ downloadStates, startDownload, cancelDownload, retryDownload, clearCompleted }}>
            {children}
        </DownloadContext.Provider>
    );
}

export function useDownload() {
    const context = useContext(DownloadContext);
    if (context === undefined) {
        throw new Error('useDownload must be used within a DownloadProvider');
    }
    return context;
}
