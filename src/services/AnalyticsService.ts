import { datadogLogs } from '@datadog/browser-logs';

declare global {
    interface Window {
        gtag: (...args: any[]) => void;
        dataLayer: any[];
    }
}

// Configuration Constants
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const DD_CLIENT_TOKEN = import.meta.env.VITE_DD_CLIENT_TOKEN;
const DD_SITE = import.meta.env.VITE_DD_SITE || 'datadoghq.com';
const DD_SERVICE = 'tatakai-web';

class AnalyticsService {
    private static instance: AnalyticsService;
    private initialized = false;

    private constructor() { }

    public static getInstance(): AnalyticsService {
        if (!AnalyticsService.instance) {
            AnalyticsService.instance = new AnalyticsService();
        }
        return AnalyticsService.instance;
    }

    public init() {
        if (this.initialized) return;

        // Initialize Google Analytics
        this.initGA();

        // Initialize Datadog
        this.initDatadog();

        this.initialized = true;
        console.log('[Analytics] Service initialized');
    }

    private initGA() {
        // Inject GA script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
            window.dataLayer.push(arguments);
        };
        window.gtag('js', new Date());
        window.gtag('config', GA_MEASUREMENT_ID, {
            send_page_view: false // We verify page views manually
        });
    }

    private initDatadog() {
        // Only initialize if token is provided
        if (!DD_CLIENT_TOKEN) {
            return; // Silently skip if not configured
        }

        try {
            datadogLogs.init({
                clientToken: DD_CLIENT_TOKEN,
                site: DD_SITE,
                service: DD_SERVICE,
                forwardErrorsToLogs: true,
                sessionSampleRate: 100,
                beforeSend: (log) => {
                    // Filter out 403 errors from Datadog API itself
                    if (log.message?.includes('403') || log.message?.includes('Forbidden')) {
                        return false; // Don't send to avoid infinite loops
                    }
                    return true;
                },
            });
        } catch (e) {
            // Silently fail - Datadog is optional
        }
    }

    // --- Tracking Methods ---

    public trackPageView(path: string, title?: string) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'page_view', {
                page_title: title || document.title,
                page_location: window.location.href,
                page_path: path
            });
        }

        // Log meaningful page views to Datadog
        datadogLogs.logger.info(`Page View: ${path}`, { path, title });
    }

    public trackEvent(eventName: string, params?: Record<string, any>) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, params);
        }

        datadogLogs.logger.info(`Event: ${eventName}`, { ...params });
    }

    public trackError(error: Error, context?: Record<string, any>) {
        datadogLogs.logger.error(error.message, { error, ...context });

        if (typeof window.gtag === 'function') {
            window.gtag('event', 'exception', {
                description: error.message,
                fatal: false,
                ...context
            });
        }
    }

    public trackAnimeInteraction(type: 'view' | 'search' | 'add_to_list' | 'remove_from_list', animeId: string, metadata?: Record<string, any>) {
        this.trackEvent(`anime_${type}`, {
            anime_id: animeId,
            ...metadata
        });
    }

    public trackSocialInteraction(type: 'follow' | 'unfollow' | 'comment' | 'rate' | 'share', targetId: string, metadata?: Record<string, any>) {
        this.trackEvent(`social_${type}`, {
            target_id: targetId,
            ...metadata
        });
    }

    public trackWatchProgress(animeId: string, episode: number, progress: number, duration: number) {
        // Debounce or throttle this in the component, but the service provides the method
        this.trackEvent('watch_progress', {
            anime_id: animeId,
            episode_number: episode,
            progress_percent: Math.round((progress / duration) * 100),
            progress_seconds: progress,
            total_duration: duration
        });
    }
}

export const analytics = AnalyticsService.getInstance();
