/**
 * WebOS API Integration
 * Handles webOS-specific APIs and TV platform integration
 */
class WebOSAPI {
    static isWebOS = false;
    static platform = 'web';

    /**
     * Check if running on webOS
     */
    static init() {
        // Check if running on webOS - be more conservative about detection
        this.isWebOS = false; // Default to false for browser
        this.platform = 'web';
        
        if (typeof webOSServiceBridge !== 'undefined' || 
            (navigator.userAgent && navigator.userAgent.includes('Web0S'))) {
            this.isWebOS = true;
            this.platform = 'webos';
            console.log('Running on webOS platform');
        } else {
            console.log('Running on web platform (development mode)');
        }

        // Initialize platform-specific features
        this.initPlatformFeatures();
    }

    /**
     * Initialize platform-specific features
     */
    static initPlatformFeatures() {
        if (this.isWebOS) {
            // webOS specific initialization
            this.initWebOSServices();
        } else {
            // Web development mode
            this.initWebDevelopmentMode();
        }
    }

    /**
     * Initialize webOS services
     */
    static initWebOSServices() {
        try {
            // Check if PalmServiceBridge is available
            if (typeof PalmServiceBridge !== 'undefined') {
                // Initialize TV service for display settings
                this.tvService = new PalmServiceBridge();
                
                // Initialize media service for video playback
                this.mediaService = new PalmServiceBridge();
                
                // Initialize app lifecycle management
                this.appService = new PalmServiceBridge();
                
                console.log('webOS services initialized');
            } else {
                console.log('PalmServiceBridge not available, using mock services');
                this.initWebDevelopmentMode();
            }
        } catch (error) {
            console.error('Error initializing webOS services:', error);
            // Fallback to development mode
            this.initWebDevelopmentMode();
        }
    }

    /**
     * Initialize web development mode
     */
    static initWebDevelopmentMode() {
        // Mock webOS APIs for development
        window.webOSServiceBridge = {
            call: (uri, params, callback) => {
                console.log('Mock webOS call:', uri, params);
                if (callback) {
                    setTimeout(() => callback({returnValue: true}), 100);
                }
            }
        };
    }

    /**
     * Get TV display information
     */
    static getTVDisplayInfo(callback) {
        if (this.isWebOS && this.tvService) {
            this.tvService.call('luna://com.webos.service.tv.display/getDisplayInfo', {}, callback);
        } else {
            // Mock response for development
            const mockInfo = {
                returnValue: true,
                width: 1920,
                height: 1080,
                refreshRate: 60
            };
            if (callback) callback(mockInfo);
        }
    }

    /**
     * Set video display mode
     */
    static setVideoDisplayMode(mode = 'auto') {
        if (this.isWebOS && this.mediaService) {
            this.mediaService.call('luna://com.webos.service.media/setDisplayMode', {
                mode: mode
            }, (response) => {
                console.log('Display mode set:', response);
            });
        } else {
            console.log('Mock: Set video display mode to', mode);
        }
    }

    /**
     * Handle app visibility changes
     */
    static handleAppVisibility(isVisible) {
        if (this.isWebOS && this.appService) {
            this.appService.call('luna://com.webos.service.applicationmanager/getForegroundAppInfo', {}, (response) => {
                console.log('App visibility changed:', isVisible, response);
            });
        } else {
            console.log('Mock: App visibility changed:', isVisible);
        }
    }

    /**
     * Launch external app (if needed)
     */
    static launchApp(appId, params = {}) {
        if (this.isWebOS && this.appService) {
            this.appService.call('luna://com.webos.service.applicationmanager/launch', {
                id: appId,
                params: params
            }, (response) => {
                console.log('App launched:', response);
            });
        } else {
            console.log('Mock: Launch app', appId, params);
        }
    }

    /**
     * Get system information
     */
    static getSystemInfo(callback) {
        if (this.isWebOS && typeof PalmServiceBridge !== 'undefined') {
            const service = new PalmServiceBridge();
            service.call('luna://com.webos.service.tv.systemproperty/getSystemInfo', {
                keys: ['modelName', 'firmwareVersion', 'UHD']
            }, callback);
        } else {
            // Mock system info for development
            const mockInfo = {
                returnValue: true,
                modelName: 'Development TV',
                firmwareVersion: '1.0.0',
                UHD: true
            };
            if (callback) callback(mockInfo);
        }
    }

    /**
     * Handle remote control key events
     */
    static handleRemoteKey(keyCode, keyEvent) {
        console.log('Remote key pressed:', keyCode, keyEvent);
        
        // Standard webOS remote key codes
        const remoteKeys = {
            37: 'LEFT',
            38: 'UP', 
            39: 'RIGHT',
            40: 'DOWN',
            13: 'OK',
            8: 'BACK',
            36: 'HOME',
            403: 'RED',
            404: 'GREEN',
            405: 'YELLOW',
            406: 'BLUE',
            412: 'REWIND',
            415: 'PLAY_PAUSE',
            417: 'FAST_FORWARD'
        };

        const keyName = remoteKeys[keyCode] || 'UNKNOWN';
        
        // Dispatch custom event for navigation handler
        const customEvent = new CustomEvent('remoteKeyPress', {
            detail: {
                keyCode: keyCode,
                keyName: keyName,
                originalEvent: keyEvent
            }
        });
        
        document.dispatchEvent(customEvent);
        
        return keyName;
    }

    /**
     * Show/hide cursor (for mouse pointer on TV)
     */
    static setCursorVisibility(visible) {
        if (this.isWebOS) {
            document.body.style.cursor = visible ? 'pointer' : 'none';
        } else {
            console.log('Mock: Set cursor visibility:', visible);
        }
    }

    /**
     * Exit app
     */
    static exitApp() {
        if (this.isWebOS && this.appService) {
            this.appService.call('luna://com.webos.service.applicationmanager/close', {}, (response) => {
                console.log('App closed:', response);
            });
        } else {
            console.log('Mock: Exit app');
            window.close();
        }
    }

    /**
     * Toast notification (webOS specific)
     */
    static showToast(message, duration = 3000) {
        if (this.isWebOS && typeof PalmServiceBridge !== 'undefined') {
            const service = new PalmServiceBridge();
            service.call('luna://com.webos.notification/createToast', {
                message: message,
                noaction: true
            }, (response) => {
                console.log('Toast shown:', response);
            });
        } else {
            // Fallback for web development
            console.log('Toast:', message);
            
            // Create a simple toast for development
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ff6b6b;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 10000;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, duration);
        }
    }
}

// Initialize webOS API when script loads
document.addEventListener('DOMContentLoaded', () => {
    WebOSAPI.init();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebOSAPI;
} else {
    window.WebOSAPI = WebOSAPI;
}