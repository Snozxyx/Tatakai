/**
 * Video Player Manager
 * Handles video playback with HLS support and remote control
 */
class VideoPlayerManager {
    constructor() {
        this.player = null;
        this.hls = null;
        this.currentSources = null;
        this.isFullscreen = false;
        this.controlsVisible = true;
        this.controlsTimeout = null;
        
        this.init();
    }

    /**
     * Initialize video player
     */
    init() {
        this.player = document.getElementById('video-player');
        if (!this.player) {
            console.error('Video player element not found');
            return;
        }

        this.bindEvents();
        this.setupControls();
        
        console.log('Video player initialized');
    }

    /**
     * Bind video player events
     */
    bindEvents() {
        if (!this.player) return;

        // Video events
        this.player.addEventListener('loadstart', () => this.onLoadStart());
        this.player.addEventListener('canplay', () => this.onCanPlay());
        this.player.addEventListener('play', () => this.onPlay());
        this.player.addEventListener('pause', () => this.onPause());
        this.player.addEventListener('ended', () => this.onEnded());
        this.player.addEventListener('error', (e) => this.onError(e));
        this.player.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.player.addEventListener('loadedmetadata', () => this.onMetadataLoaded());

        // Remote control events
        document.addEventListener('remoteKeyPress', (e) => this.handleRemoteKey(e.detail));
        
        // Mouse/touch events for development
        this.player.addEventListener('click', () => this.togglePlayPause());
        
        // Fullscreen events
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.onFullscreenChange());
    }

    /**
     * Setup video controls
     */
    setupControls() {
        // Hide default controls on TV
        if (WebOSAPI.isWebOS) {
            this.player.controls = false;
        } else {
            // Keep controls for development
            this.player.controls = true;
        }

        // Auto-hide controls
        this.startControlsTimeout();
    }

    /**
     * Load video with sources
     */
    loadVideo(sourcesData) {
        if (!this.player || !sourcesData) {
            console.error('Cannot load video: missing player or sources data');
            return;
        }

        this.currentSources = sourcesData;
        
        console.log('Loading video sources:', sourcesData);

        // Clean up previous HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        // Get the best quality source
        const sources = sourcesData.sources;
        if (!sources || sources.length === 0) {
            console.error('No video sources available');
            WebOSAPI.showToast('No video sources available');
            return;
        }

        // Sort sources by quality (highest first)
        const sortedSources = sources.sort((a, b) => {
            const qualityA = this.getQualityValue(a.quality);
            const qualityB = this.getQualityValue(b.quality);
            return qualityB - qualityA;
        });

        const primarySource = sortedSources[0];
        console.log('Using primary source:', primarySource);

        // Load video based on source type
        if (primarySource.isM3U8 && this.isHLSSupported()) {
            this.loadHLSVideo(primarySource.url);
        } else {
            this.loadDirectVideo(primarySource.url);
        }

        // Load subtitles if available
        if (sourcesData.subtitles && sourcesData.subtitles.length > 0) {
            this.loadSubtitles(sourcesData.subtitles);
        }
    }

    /**
     * Check if HLS is supported
     */
    isHLSSupported() {
        return this.player.canPlayType('application/vnd.apple.mpegurl') || 
               (typeof Hls !== 'undefined' && Hls.isSupported());
    }

    /**
     * Load HLS video
     */
    loadHLSVideo(url) {
        if (this.player.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari, webOS)
            console.log('Using native HLS support');
            this.player.src = url;
            this.player.load();
        } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            // Use hls.js for other browsers
            console.log('Using hls.js');
            this.hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90
            });

            this.hls.loadSource(url);
            this.hls.attachMedia(this.player);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest parsed');
                this.player.play().catch(e => {
                    console.log('Auto-play prevented:', e);
                });
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS error:', event, data);
                if (data.fatal) {
                    this.handleHLSError(data);
                }
            });
        } else {
            console.error('HLS not supported');
            WebOSAPI.showToast('Video format not supported');
        }
    }

    /**
     * Load direct video
     */
    loadDirectVideo(url) {
        console.log('Loading direct video:', url);
        this.player.src = url;
        this.player.load();
    }

    /**
     * Load subtitles
     */
    loadSubtitles(subtitles) {
        // Clear existing subtitles
        const existingTracks = this.player.querySelectorAll('track');
        existingTracks.forEach(track => track.remove());

        // Add new subtitle tracks
        subtitles.forEach((subtitle, index) => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = subtitle.lang || `Subtitle ${index + 1}`;
            track.srclang = subtitle.lang?.toLowerCase().substr(0, 2) || 'en';
            track.src = subtitle.url;
            track.default = index === 0; // Make first subtitle default
            
            this.player.appendChild(track);
        });

        console.log('Loaded', subtitles.length, 'subtitle tracks');
    }

    /**
     * Handle HLS errors
     */
    handleHLSError(data) {
        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, trying to recover...');
                this.hls.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, trying to recover...');
                this.hls.recoverMediaError();
                break;
            default:
                console.error('Fatal error, cannot recover');
                WebOSAPI.showToast('Video playback error');
                break;
        }
    }

    /**
     * Get quality value for sorting
     */
    getQualityValue(quality) {
        if (!quality) return 0;
        
        const qualityMap = {
            '1080p': 1080,
            '720p': 720,
            '480p': 480,
            '360p': 360,
            '240p': 240,
            'auto': 9999
        };
        
        return qualityMap[quality] || 0;
    }

    /**
     * Handle remote control keys
     */
    handleRemoteKey(detail) {
        const { keyName } = detail;
        
        switch (keyName) {
            case 'PLAY_PAUSE':
                this.togglePlayPause();
                break;
            case 'LEFT':
                this.rewind(10);
                break;
            case 'RIGHT':
                this.fastForward(10);
                break;
            case 'UP':
                this.volumeUp();
                break;
            case 'DOWN':
                this.volumeDown();
                break;
            case 'OK':
                this.togglePlayPause();
                break;
            case 'BACK':
                this.exitPlayer();
                break;
            case 'REWIND':
                this.rewind(30);
                break;
            case 'FAST_FORWARD':
                this.fastForward(30);
                break;
            case 'RED':
                this.toggleSubtitles();
                break;
            case 'GREEN':
                this.changeQuality();
                break;
            case 'BLUE':
                this.toggleFullscreen();
                break;
        }
        
        // Show controls when user interacts
        this.showControls();
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (!this.player) return;
        
        if (this.player.paused) {
            this.player.play().catch(e => {
                console.error('Play failed:', e);
                WebOSAPI.showToast('Failed to play video');
            });
        } else {
            this.player.pause();
        }
    }

    /**
     * Rewind video
     */
    rewind(seconds) {
        if (!this.player) return;
        
        this.player.currentTime = Math.max(0, this.player.currentTime - seconds);
        WebOSAPI.showToast(`Rewound ${seconds} seconds`);
    }

    /**
     * Fast forward video
     */
    fastForward(seconds) {
        if (!this.player) return;
        
        this.player.currentTime = Math.min(this.player.duration, this.player.currentTime + seconds);
        WebOSAPI.showToast(`Fast forwarded ${seconds} seconds`);
    }

    /**
     * Volume up
     */
    volumeUp() {
        if (!this.player) return;
        
        this.player.volume = Math.min(1, this.player.volume + 0.1);
        WebOSAPI.showToast(`Volume: ${Math.round(this.player.volume * 100)}%`);
    }

    /**
     * Volume down
     */
    volumeDown() {
        if (!this.player) return;
        
        this.player.volume = Math.max(0, this.player.volume - 0.1);
        WebOSAPI.showToast(`Volume: ${Math.round(this.player.volume * 100)}%`);
    }

    /**
     * Toggle subtitles
     */
    toggleSubtitles() {
        if (!this.player) return;
        
        const tracks = this.player.textTracks;
        if (tracks.length === 0) {
            WebOSAPI.showToast('No subtitles available');
            return;
        }

        // Find currently active track
        let activeTrack = null;
        let activeIndex = -1;
        
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].mode === 'showing') {
                activeTrack = tracks[i];
                activeIndex = i;
                break;
            }
        }

        // Cycle through subtitles
        if (activeTrack) {
            activeTrack.mode = 'disabled';
            const nextIndex = (activeIndex + 1) % tracks.length;
            if (nextIndex === 0) {
                WebOSAPI.showToast('Subtitles off');
            } else {
                tracks[nextIndex].mode = 'showing';
                WebOSAPI.showToast(`Subtitles: ${tracks[nextIndex].label}`);
            }
        } else {
            tracks[0].mode = 'showing';
            WebOSAPI.showToast(`Subtitles: ${tracks[0].label}`);
        }
    }

    /**
     * Change quality (if supported)
     */
    changeQuality() {
        if (this.hls && this.hls.levels.length > 1) {
            const currentLevel = this.hls.currentLevel;
            const nextLevel = (currentLevel + 1) % this.hls.levels.length;
            this.hls.currentLevel = nextLevel;
            
            const quality = this.hls.levels[nextLevel].height + 'p';
            WebOSAPI.showToast(`Quality: ${quality}`);
        } else {
            WebOSAPI.showToast('Quality change not available');
        }
    }

    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    /**
     * Enter fullscreen
     */
    enterFullscreen() {
        const element = this.player;
        
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        }
    }

    /**
     * Exit fullscreen
     */
    exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    /**
     * Exit video player
     */
    exitPlayer() {
        // Pause video
        if (this.player && !this.player.paused) {
            this.player.pause();
        }
        
        // Go back to previous screen
        if (window.navigationManager) {
            window.navigationManager.navigateBack();
        }
    }

    /**
     * Show controls
     */
    showControls() {
        this.controlsVisible = true;
        // Custom controls implementation would go here
        this.startControlsTimeout();
    }

    /**
     * Hide controls
     */
    hideControls() {
        this.controlsVisible = false;
        // Custom controls implementation would go here
    }

    /**
     * Start controls timeout
     */
    startControlsTimeout() {
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
        }
        
        this.controlsTimeout = setTimeout(() => {
            if (!this.player.paused) {
                this.hideControls();
            }
        }, 3000);
    }

    /**
     * Event handlers
     */
    onLoadStart() {
        console.log('Video load started');
        WebOSAPI.showToast('Loading video...');
    }

    onCanPlay() {
        console.log('Video can play');
        // Auto-play if not paused
        if (this.player.paused) {
            this.player.play().catch(e => {
                console.log('Auto-play prevented:', e);
            });
        }
    }

    onPlay() {
        console.log('Video playing');
        this.startControlsTimeout();
    }

    onPause() {
        console.log('Video paused');
        this.showControls();
    }

    onEnded() {
        console.log('Video ended');
        WebOSAPI.showToast('Video ended');
        // Could implement next episode functionality here
    }

    onError(event) {
        console.error('Video error:', event);
        WebOSAPI.showToast('Video playback error');
    }

    onTimeUpdate() {
        // Update progress if custom controls are implemented
        // For now, just use default video element controls
    }

    onMetadataLoaded() {
        console.log('Video metadata loaded');
        console.log('Duration:', this.formatTime(this.player.duration));
    }

    onFullscreenChange() {
        this.isFullscreen = !!(document.fullscreenElement || 
                              document.webkitFullscreenElement || 
                              document.mozFullScreenElement || 
                              document.msFullscreenElement);
        
        console.log('Fullscreen changed:', this.isFullscreen);
    }

    /**
     * Format time for display
     */
    formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hrs > 0) {
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = null;
        }
        
        this.player = null;
        this.currentSources = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoPlayerManager;
} else {
    window.VideoPlayerManager = VideoPlayerManager;
}