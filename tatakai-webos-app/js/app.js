/**
 * Main Application Entry Point
 * Initializes all managers and starts the webOS app
 */
class TatakaiApp {
    constructor() {
        this.navigationManager = null;
        this.uiManager = null;
        this.videoPlayerManager = null;
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            console.log('Initializing Tatakai webOS App...');
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // Initialize webOS APIs (this should not throw errors)
            try {
                WebOSAPI.init();
            } catch (webosError) {
                console.warn('webOS API initialization failed, continuing with web mode:', webosError);
            }
            
            // Initialize core managers
            this.initializeManagers();
            
            // Setup app lifecycle
            this.setupAppLifecycle();
            
            // Setup global error handling
            this.setupErrorHandling();
            
            // Mark as initialized
            this.isInitialized = true;
            
            console.log('Tatakai webOS App initialized successfully');
            
            // Optional: Show welcome message on TV
            if (WebOSAPI.isWebOS) {
                WebOSAPI.showToast('Welcome to Tatakai!');
            }
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showInitializationError(error);
        }
    }

    /**
     * Initialize core managers
     */
    initializeManagers() {
        try {
            // Initialize UI Manager first
            this.uiManager = new UIManager();
            
            // Initialize Navigation Manager
            this.navigationManager = new NavigationManager();
            
            // Initialize Video Player Manager
            this.videoPlayerManager = new VideoPlayerManager();
            
            // Make managers globally available
            window.navigationManager = this.navigationManager;
            window.uiManager = this.uiManager;
            window.VideoPlayerManager = this.videoPlayerManager;
            
            console.log('All managers initialized successfully');
            
        } catch (error) {
            console.error('Error initializing managers:', error);
            throw error;
        }
    }

    /**
     * Setup app lifecycle management
     */
    setupAppLifecycle() {
        // Handle app visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.onAppPaused();
            } else {
                this.onAppResumed();
            }
        });

        // Handle app focus/blur
        window.addEventListener('focus', () => this.onAppFocused());
        window.addEventListener('blur', () => this.onAppBlurred());

        // Handle beforeunload for cleanup
        window.addEventListener('beforeunload', () => this.onAppExit());

        // webOS specific lifecycle events
        if (WebOSAPI.isWebOS) {
            // Handle webOS app events
            document.addEventListener('webOSLaunch', (e) => this.onWebOSLaunch(e.detail));
            document.addEventListener('webOSRelaunch', (e) => this.onWebOSRelaunch(e.detail));
        }
    }

    /**
     * Setup global error handling
     */
    setupErrorHandling() {
        // Catch unhandled errors
        window.addEventListener('error', (event) => {
            console.error('Unhandled error:', event.error);
            this.handleGlobalError(event.error);
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleGlobalError(event.reason);
        });
    }

    /**
     * App lifecycle event handlers
     */
    onAppPaused() {
        console.log('App paused');
        
        // Pause video if playing
        if (this.videoPlayerManager && this.videoPlayerManager.player) {
            const player = this.videoPlayerManager.player;
            if (!player.paused) {
                player.pause();
            }
        }
        
        // Stop spotlight rotation
        if (this.uiManager && this.uiManager.spotlightInterval) {
            clearInterval(this.uiManager.spotlightInterval);
        }
        
        WebOSAPI.handleAppVisibility(false);
    }

    onAppResumed() {
        console.log('App resumed');
        
        // Resume spotlight rotation if on home screen
        if (this.uiManager && this.navigationManager && 
            this.navigationManager.currentScreen === 'home') {
            this.uiManager.startSpotlightRotation();
        }
        
        WebOSAPI.handleAppVisibility(true);
    }

    onAppFocused() {
        console.log('App focused');
        // Refresh navigation focus
        if (this.navigationManager) {
            this.navigationManager.refresh();
        }
    }

    onAppBlurred() {
        console.log('App blurred');
        // Pause video to save resources
        if (this.videoPlayerManager && this.videoPlayerManager.player) {
            const player = this.videoPlayerManager.player;
            if (!player.paused) {
                player.pause();
            }
        }
    }

    onAppExit() {
        console.log('App exiting');
        this.cleanup();
    }

    /**
     * webOS specific launch handlers
     */
    onWebOSLaunch(params) {
        console.log('webOS app launched with params:', params);
        
        // Handle launch parameters
        if (params && params.contentTarget) {
            // App was launched to play specific content
            this.handleContentTarget(params.contentTarget);
        }
    }

    onWebOSRelaunch(params) {
        console.log('webOS app relaunched with params:', params);
        
        // Handle relaunch parameters
        if (params && params.contentTarget) {
            this.handleContentTarget(params.contentTarget);
        }
    }

    /**
     * Handle content target (deep linking)
     */
    handleContentTarget(contentTarget) {
        try {
            // Parse content target for anime ID or search query
            if (contentTarget.startsWith('anime:')) {
                const animeId = contentTarget.replace('anime:', '');
                this.uiManager.showAnimeDetail(animeId);
            } else if (contentTarget.startsWith('search:')) {
                const query = contentTarget.replace('search:', '');
                document.getElementById('search-input').value = query;
                this.navigationManager.changeScreen('search');
                this.uiManager.performSearch();
            }
        } catch (error) {
            console.error('Error handling content target:', error);
        }
    }

    /**
     * Handle global errors
     */
    handleGlobalError(error) {
        // Log error details
        console.error('Global error handled:', error);
        
        // Show user-friendly error message
        const message = this.getErrorMessage(error);
        WebOSAPI.showToast(message, 5000);
        
        // Try to recover to home screen
        if (this.navigationManager && this.isInitialized) {
            setTimeout(() => {
                this.navigationManager.navigateHome();
            }, 2000);
        }
    }

    /**
     * Get user-friendly error message
     */
    getErrorMessage(error) {
        if (!error) return 'An unknown error occurred';
        
        const message = error.message || error.toString();
        
        // Network errors
        if (message.includes('fetch') || message.includes('network') || 
            message.includes('Failed to fetch')) {
            return 'Network connection error. Please check your internet connection.';
        }
        
        // Video errors
        if (message.includes('video') || message.includes('media')) {
            return 'Video playback error. Please try again.';
        }
        
        // API errors
        if (message.includes('API') || message.includes('HTTP')) {
            return 'Service temporarily unavailable. Please try again later.';
        }
        
        // Generic error
        return 'Something went wrong. Please try again.';
    }

    /**
     * Show initialization error
     */
    showInitializationError(error) {
        // Create error screen
        const errorScreen = document.createElement('div');
        errorScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
            font-family: Arial, sans-serif;
        `;
        
        errorScreen.innerHTML = `
            <div style="text-align: center; max-width: 600px; padding: 2rem;">
                <h1 style="color: #ff6b6b; font-size: 3rem; margin-bottom: 2rem;">
                    Initialization Error
                </h1>
                <p style="font-size: 1.5rem; margin-bottom: 2rem; line-height: 1.6;">
                    Failed to start Tatakai app. Please check your internet connection and try again.
                </p>
                <p style="font-size: 1rem; color: #cccccc; margin-bottom: 2rem;">
                    Error: ${error.message || 'Unknown error'}
                </p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button onclick="location.reload()" style="
                        padding: 12px 24px;
                        background: #ff6b6b;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 1.2rem;
                        cursor: pointer;
                    ">
                        Retry
                    </button>
                    <button onclick="WebOSAPI.exitApp()" style="
                        padding: 12px 24px;
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-radius: 8px;
                        font-size: 1.2rem;
                        cursor: pointer;
                    ">
                        Exit
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorScreen);
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        try {
            // Cleanup video player
            if (this.videoPlayerManager) {
                this.videoPlayerManager.destroy();
            }
            
            // Clear intervals
            if (this.uiManager && this.uiManager.spotlightInterval) {
                clearInterval(this.uiManager.spotlightInterval);
            }
            
            // Clear timeouts
            if (this.navigationManager && this.navigationManager.controlsTimeout) {
                clearTimeout(this.navigationManager.controlsTimeout);
            }
            
            console.log('App cleanup completed');
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Get app status for debugging
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            currentScreen: this.navigationManager?.currentScreen,
            isWebOS: WebOSAPI.isWebOS,
            platform: WebOSAPI.platform,
            hasVideo: !!this.videoPlayerManager?.player,
            managers: {
                navigation: !!this.navigationManager,
                ui: !!this.uiManager,
                videoPlayer: !!this.videoPlayerManager
            }
        };
    }
}

// Initialize app when script loads
let tatakaiApp;

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    tatakaiApp = new TatakaiApp();
});

// Make app globally available for debugging
window.TatakaiApp = TatakaiApp;
window.tatakaiApp = tatakaiApp;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TatakaiApp;
}