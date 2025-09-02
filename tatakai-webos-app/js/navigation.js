/**
 * Navigation Manager for Remote Control
 * Handles TV remote control navigation and focus management
 */
class NavigationManager {
    constructor() {
        this.focusableElements = [];
        this.currentFocusIndex = 0;
        this.isNavigating = false;
        this.navigationHistory = [];
        this.currentScreen = 'home';
        
        this.init();
    }

    /**
     * Initialize navigation system
     */
    init() {
        this.bindEvents();
        this.updateFocusableElements();
        this.setInitialFocus();
        
        console.log('Navigation manager initialized');
    }

    /**
     * Bind keyboard and remote control events
     */
    bindEvents() {
        // Standard keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Custom remote control events
        document.addEventListener('remoteKeyPress', (e) => this.handleRemoteKey(e.detail));
        
        // Focus management
        document.addEventListener('focusin', (e) => this.handleFocusIn(e));
        document.addEventListener('focusout', (e) => this.handleFocusOut(e));
        
        // Screen change events
        document.addEventListener('screenChange', (e) => this.handleScreenChange(e.detail));
    }

    /**
     * Handle keyboard navigation
     */
    handleKeyDown(event) {
        const keyCode = event.keyCode;
        
        // Map keyboard keys to navigation actions
        switch (keyCode) {
            case 37: // Left arrow
                this.navigateLeft();
                event.preventDefault();
                break;
            case 38: // Up arrow
                this.navigateUp();
                event.preventDefault();
                break;
            case 39: // Right arrow
                this.navigateRight();
                event.preventDefault();
                break;
            case 40: // Down arrow
                this.navigateDown();
                event.preventDefault();
                break;
            case 13: // Enter
                this.selectCurrent();
                event.preventDefault();
                break;
            case 27: // Escape
            case 8:  // Backspace
                this.navigateBack();
                event.preventDefault();
                break;
            case 36: // Home
                this.navigateHome();
                event.preventDefault();
                break;
            case 191: // ? key for help
                this.showHelp();
                event.preventDefault();
                break;
        }
    }

    /**
     * Handle remote control specific keys
     */
    handleRemoteKey(detail) {
        const { keyName, keyCode } = detail;
        
        console.log('Remote key:', keyName, keyCode);
        
        switch (keyName) {
            case 'LEFT':
                this.navigateLeft();
                break;
            case 'UP':
                this.navigateUp();
                break;
            case 'RIGHT':
                this.navigateRight();
                break;
            case 'DOWN':
                this.navigateDown();
                break;
            case 'OK':
                this.selectCurrent();
                break;
            case 'BACK':
                this.navigateBack();
                break;
            case 'HOME':
                this.navigateHome();
                break;
            case 'RED':
                this.showSearch();
                break;
            case 'GREEN':
                this.showFavorites();
                break;
            case 'YELLOW':
                this.showSettings();
                break;
            case 'BLUE':
                this.showCategories();
                break;
            case 'PLAY_PAUSE':
                this.togglePlayPause();
                break;
            case 'REWIND':
                this.rewindVideo();
                break;
            case 'FAST_FORWARD':
                this.fastForwardVideo();
                break;
        }
    }

    /**
     * Update list of focusable elements
     */
    updateFocusableElements() {
        this.focusableElements = [];
        
        // Always include sidebar navigation items if visible
        const sidebarNav = document.querySelector('.sidebar-nav:not(.hidden)');
        if (sidebarNav) {
            const navItems = Array.from(sidebarNav.querySelectorAll('.focusable:not([disabled])'));
            this.focusableElements = [...this.focusableElements, ...navItems];
        }
        
        // Get all focusable elements in the current visible screen
        const currentScreenEl = document.querySelector('.screen.active');
        if (currentScreenEl) {
            const screenItems = Array.from(currentScreenEl.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
            this.focusableElements = [...this.focusableElements, ...screenItems];
        }
        
        console.log('Updated focusable elements:', this.focusableElements.length);
    }

    /**
     * Set initial focus
     */
    setInitialFocus() {
        this.updateFocusableElements();
        if (this.focusableElements.length > 0) {
            this.currentFocusIndex = 0;
            this.setFocus(0);
        }
    }

    /**
     * Set focus to specific element index
     */
    setFocus(index) {
        if (index < 0 || index >= this.focusableElements.length) return;
        
        // Remove focus from all elements
        this.focusableElements.forEach(el => {
            el.classList.remove('focused');
            el.blur();
        });
        
        // Set focus to current element
        this.currentFocusIndex = index;
        const currentElement = this.focusableElements[index];
        if (currentElement) {
            currentElement.classList.add('focused');
            currentElement.focus();
            this.scrollIntoView(currentElement);
        }
    }

    /**
     * Scroll element into view if needed
     */
    scrollIntoView(element) {
        // Check if element is in sidebar navigation
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav && sidebarNav.contains(element)) {
            // For sidebar elements, just ensure they're visible
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
            return;
        }
        
        // For main content elements
        const rect = element.getBoundingClientRect();
        const containerRect = document.querySelector('.main-content').getBoundingClientRect();
        
        if (rect.bottom > containerRect.bottom || rect.top < containerRect.top) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center'
            });
        }
    }

    /**
     * Navigate left (previous element in row or previous column)
     */
    navigateLeft() {
        const currentEl = this.focusableElements[this.currentFocusIndex];
        if (!currentEl) return;
        
        const currentRect = currentEl.getBoundingClientRect();
        let bestMatch = -1;
        let bestDistance = Infinity;
        
        // Find element to the left with similar Y position
        for (let i = 0; i < this.focusableElements.length; i++) {
            if (i === this.currentFocusIndex) continue;
            
            const el = this.focusableElements[i];
            const rect = el.getBoundingClientRect();
            
            // Check if element is to the left and roughly in the same row
            if (rect.right <= currentRect.left && 
                Math.abs(rect.top - currentRect.top) < currentRect.height) {
                const distance = Math.abs(rect.right - currentRect.left) + 
                               Math.abs(rect.top - currentRect.top);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = i;
                }
            }
        }
        
        if (bestMatch >= 0) {
            this.setFocus(bestMatch);
        } else {
            // Fallback: go to previous element
            const newIndex = this.currentFocusIndex > 0 ? this.currentFocusIndex - 1 : this.focusableElements.length - 1;
            this.setFocus(newIndex);
        }
    }

    /**
     * Navigate right
     */
    navigateRight() {
        const currentEl = this.focusableElements[this.currentFocusIndex];
        if (!currentEl) return;
        
        const currentRect = currentEl.getBoundingClientRect();
        let bestMatch = -1;
        let bestDistance = Infinity;
        
        // Find element to the right with similar Y position
        for (let i = 0; i < this.focusableElements.length; i++) {
            if (i === this.currentFocusIndex) continue;
            
            const el = this.focusableElements[i];
            const rect = el.getBoundingClientRect();
            
            // Check if element is to the right and roughly in the same row
            if (rect.left >= currentRect.right && 
                Math.abs(rect.top - currentRect.top) < currentRect.height) {
                const distance = Math.abs(rect.left - currentRect.right) + 
                               Math.abs(rect.top - currentRect.top);
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = i;
                }
            }
        }
        
        if (bestMatch >= 0) {
            this.setFocus(bestMatch);
        } else {
            // Fallback: go to next element
            const newIndex = this.currentFocusIndex < this.focusableElements.length - 1 ? 
                           this.currentFocusIndex + 1 : 0;
            this.setFocus(newIndex);
        }
    }

    /**
     * Navigate up
     */
    navigateUp() {
        const currentEl = this.focusableElements[this.currentFocusIndex];
        if (!currentEl) return;
        
        const currentRect = currentEl.getBoundingClientRect();
        let bestMatch = -1;
        let bestDistance = Infinity;
        
        // Find element above with similar X position
        for (let i = 0; i < this.focusableElements.length; i++) {
            if (i === this.currentFocusIndex) continue;
            
            const el = this.focusableElements[i];
            const rect = el.getBoundingClientRect();
            
            // Check if element is above and roughly in the same column
            if (rect.bottom <= currentRect.top) {
                const xDistance = Math.abs((rect.left + rect.width/2) - (currentRect.left + currentRect.width/2));
                const yDistance = Math.abs(rect.bottom - currentRect.top);
                const distance = xDistance + yDistance * 2; // Weight vertical distance more
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = i;
                }
            }
        }
        
        if (bestMatch >= 0) {
            this.setFocus(bestMatch);
        }
    }

    /**
     * Navigate down
     */
    navigateDown() {
        const currentEl = this.focusableElements[this.currentFocusIndex];
        if (!currentEl) return;
        
        const currentRect = currentEl.getBoundingClientRect();
        let bestMatch = -1;
        let bestDistance = Infinity;
        
        // Find element below with similar X position
        for (let i = 0; i < this.focusableElements.length; i++) {
            if (i === this.currentFocusIndex) continue;
            
            const el = this.focusableElements[i];
            const rect = el.getBoundingClientRect();
            
            // Check if element is below and roughly in the same column
            if (rect.top >= currentRect.bottom) {
                const xDistance = Math.abs((rect.left + rect.width/2) - (currentRect.left + currentRect.width/2));
                const yDistance = Math.abs(rect.top - currentRect.bottom);
                const distance = xDistance + yDistance * 2; // Weight vertical distance more
                
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = i;
                }
            }
        }
        
        if (bestMatch >= 0) {
            this.setFocus(bestMatch);
        }
    }

    /**
     * Select current element
     */
    selectCurrent() {
        const currentEl = this.focusableElements[this.currentFocusIndex];
        if (!currentEl) return;
        
        console.log('Selecting element:', currentEl);
        
        // Trigger click event
        currentEl.click();
        
        // Handle specific element types
        if (currentEl.tagName === 'INPUT') {
            currentEl.focus();
        }
    }

    /**
     * Navigate back
     */
    navigateBack() {
        if (this.navigationHistory.length > 0) {
            const previousScreen = this.navigationHistory.pop();
            this.changeScreen(previousScreen, false);
        } else {
            // Exit app or show home
            this.navigateHome();
        }
    }

    /**
     * Navigate to home
     */
    navigateHome() {
        this.changeScreen('home');
    }

    /**
     * Show search screen
     */
    showSearch() {
        this.changeScreen('search');
    }

    /**
     * Show categories screen
     */
    showCategories() {
        this.changeScreen('categories');
    }

    /**
     * Show help overlay
     */
    showHelp() {
        const helpOverlay = document.getElementById('help-overlay');
        if (helpOverlay) {
            helpOverlay.classList.remove('hidden');
        }
    }

    /**
     * Show favorites (placeholder)
     */
    showFavorites() {
        WebOSAPI.showToast('Favorites feature coming soon!');
    }

    /**
     * Show settings (placeholder)
     */
    showSettings() {
        WebOSAPI.showToast('Settings feature coming soon!');
    }

    /**
     * Toggle play/pause for video
     */
    togglePlayPause() {
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer && !videoPlayer.paused) {
            if (videoPlayer.paused) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
        }
    }

    /**
     * Rewind video
     */
    rewindVideo() {
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
        }
    }

    /**
     * Fast forward video
     */
    fastForwardVideo() {
        const videoPlayer = document.getElementById('video-player');
        if (videoPlayer) {
            videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
        }
    }

    /**
     * Change screen
     */
    changeScreen(screenName, addToHistory = true) {
        if (addToHistory && this.currentScreen !== screenName) {
            this.navigationHistory.push(this.currentScreen);
        }
        
        this.currentScreen = screenName;
        
        // Dispatch screen change event
        const event = new CustomEvent('screenChange', {
            detail: { screen: screenName }
        });
        document.dispatchEvent(event);
    }

    /**
     * Handle screen change
     */
    handleScreenChange(detail) {
        console.log('Screen changed to:', detail.screen);
        
        // Update focusable elements for new screen
        setTimeout(() => {
            this.updateFocusableElements();
            this.setInitialFocus();
        }, 100);
    }

    /**
     * Handle focus in event
     */
    handleFocusIn(event) {
        // Update current focus index when element receives focus
        const element = event.target;
        const index = this.focusableElements.indexOf(element);
        if (index >= 0) {
            this.currentFocusIndex = index;
        }
    }

    /**
     * Handle focus out event
     */
    handleFocusOut(event) {
        // Remove focused class when element loses focus
        event.target.classList.remove('focused');
    }

    /**
     * Manually refresh navigation (call when DOM changes)
     */
    refresh() {
        this.updateFocusableElements();
        if (this.focusableElements.length > 0) {
            // Keep current focus if possible, otherwise reset to first element
            if (this.currentFocusIndex >= this.focusableElements.length) {
                this.currentFocusIndex = 0;
            }
            this.setFocus(this.currentFocusIndex);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
} else {
    window.NavigationManager = NavigationManager;
}