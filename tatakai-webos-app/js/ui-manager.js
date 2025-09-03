/**
 * UI Manager
 * Handles UI updates, content loading, and screen management
 */
class UIManager {
    constructor() {
        this.currentData = null;
        this.spotlightIndex = 0;
        this.spotlightInterval = null;
        this.init();
    }

    /**
     * Initialize UI Manager
     */
    init() {
        this.bindEvents();
        this.loadHomeData();
        
        console.log('UI Manager initialized');
    }

    /**
     * Bind UI events
     */
    bindEvents() {
        // Sidebar navigation menu clicks
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const screen = e.currentTarget.dataset.screen;
                if (screen) {
                    this.showScreen(screen);
                    this.updateActiveNavItem(e.currentTarget);
                }
            });
        });

        // Search functionality
        const searchBtn = document.getElementById('search-btn');
        const searchInput = document.getElementById('search-input');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performSearch());
        }
        
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch();
                }
            });
        }

        // Help overlay close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Backspace') {
                this.hideHelp();
            }
        });

        // Screen change events
        document.addEventListener('screenChange', (e) => {
            this.handleScreenChange(e.detail.screen);
        });
    }

    /**
     * Load home page data
     */
    async loadHomeData() {
        try {
            console.log('Loading home page data...');
            const data = await AnimeAPI.getHomePage();
            
            if (data.success) {
                this.currentData = data.data;
                this.renderHomeContent();
                this.hideLoading();
            } else {
                throw new Error('Failed to load home data');
            }
        } catch (error) {
            console.error('Error loading home data:', error);
            this.showError('Failed to load content. Please check your internet connection.');
            this.hideLoading();
        }
    }

    /**
     * Render home screen content
     */
    renderHomeContent() {
        if (!this.currentData) return;

        // Render hero section
        this.renderHeroSection();
        
        // Render content sections
        this.renderSection('trending-grid', this.currentData.trendingAnimes);
        this.renderSection('continue-grid', []); // Empty for now
        this.renderSection('popular-grid', this.currentData.mostPopularAnimes);
        this.renderSection('latest-grid', this.currentData.latestEpisodeAnimes);
    }

    /**
     * Render hero section (replacing spotlight)
     */
    renderHeroSection() {
        const heroContent = document.getElementById('hero-content');
        if (!heroContent || !this.currentData.spotlightAnimes || this.currentData.spotlightAnimes.length === 0) {
            return;
        }

        const featuredAnime = this.currentData.spotlightAnimes[0];
        const heroInfo = heroContent.querySelector('.hero-info');
        const heroBackground = heroContent.querySelector('.hero-background');
        
        if (heroInfo) {
            heroInfo.innerHTML = `
                <div class="hero-badge">TATAKAI ORIGINAL</div>
                <h1 class="hero-title">${this.escapeHtml(featuredAnime.name || 'Featured Anime')}</h1>
                <div class="hero-status">Now Streaming</div>
                <div class="hero-actions">
                    <button class="btn-play focusable" data-anime-id="${featuredAnime.id}">
                        <svg class="play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        Play Now
                    </button>
                    <button class="btn-info focusable" data-anime-id="${featuredAnime.id}">
                        <svg class="info-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                        More Info
                    </button>
                </div>
            `;

            // Add event listeners for hero buttons
            const playBtn = heroInfo.querySelector('.btn-play');
            const infoBtn = heroInfo.querySelector('.btn-info');
            
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    this.startWatching(featuredAnime.id);
                });
            }
            
            if (infoBtn) {
                infoBtn.addEventListener('click', () => {
                    this.showAnimeDetail(featuredAnime.id);
                });
            }
        }

        // Set background image
        if (heroBackground && featuredAnime.poster) {
            heroBackground.style.backgroundImage = `url(${featuredAnime.poster})`;
            heroBackground.style.backgroundSize = 'cover';
            heroBackground.style.backgroundPosition = 'center';
        }
    }

    /**
     * Render spotlight carousel
     */
    renderSpotlight() {
        const spotlightCarousel = document.getElementById('spotlight-carousel');
        if (!spotlightCarousel || !this.currentData.spotlightAnimes) return;

        spotlightCarousel.innerHTML = '';
        
        this.currentData.spotlightAnimes.slice(0, 5).forEach((anime, index) => {
            const spotlightItem = document.createElement('div');
            spotlightItem.className = `spotlight-item ${index === 0 ? 'active' : ''}`;
            spotlightItem.style.backgroundImage = `url(${anime.poster})`;
            
            spotlightItem.innerHTML = `
                <div class="spotlight-content">
                    <h2 class="spotlight-title">${this.escapeHtml(anime.name)}</h2>
                    <p class="spotlight-description">${this.escapeHtml(anime.description || '')}</p>
                    <button class="spotlight-action focusable" data-anime-id="${anime.id}">
                        Watch Now
                    </button>
                </div>
            `;
            
            // Add click handler for watch button
            const watchBtn = spotlightItem.querySelector('.spotlight-action');
            watchBtn.addEventListener('click', () => {
                this.showAnimeDetail(anime.id);
            });
            
            spotlightCarousel.appendChild(spotlightItem);
        });
    }

    /**
     * Start spotlight auto-rotation
     */
    startSpotlightRotation() {
        if (this.spotlightInterval) {
            clearInterval(this.spotlightInterval);
        }
        
        this.spotlightInterval = setInterval(() => {
            this.nextSpotlight();
        }, 5000);
    }

    /**
     * Show next spotlight item
     */
    nextSpotlight() {
        const items = document.querySelectorAll('.spotlight-item');
        if (items.length === 0) return;
        
        items[this.spotlightIndex].classList.remove('active');
        this.spotlightIndex = (this.spotlightIndex + 1) % items.length;
        items[this.spotlightIndex].classList.add('active');
    }

    /**
     * Render anime grid section
     */
    renderSection(containerId, animes) {
        const container = document.getElementById(containerId);
        if (!container || !animes) return;

        container.innerHTML = '';
        
        animes.slice(0, 12).forEach(anime => {
            const card = this.createAnimeCard(anime);
            container.appendChild(card);
        });
    }

    /**
     * Create anime card element
     */
    createAnimeCard(anime) {
        const card = document.createElement('div');
        card.className = 'anime-card focusable';
        card.dataset.animeId = anime.id;
        
        card.innerHTML = `
            <img src="${anime.poster}" alt="${this.escapeHtml(anime.name)}" class="anime-poster" 
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI4MCIgdmlld0JveD0iMCAwIDIwMCAyODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjgwIiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTQwIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiPk5vIEltYWdlPC90ZXh0Pgo8L3N2Zz4K'">
            <div class="anime-info">
                <h3 class="anime-title">${this.escapeHtml(anime.name)}</h3>
                <div class="anime-meta">
                    ${anime.type ? `<span>${anime.type}</span>` : ''}
                    ${anime.rating ? `<span>⭐ ${anime.rating}</span>` : ''}
                </div>
                ${anime.episodes ? `
                    <div class="anime-episodes">
                        ${anime.episodes.sub ? `SUB: ${anime.episodes.sub}` : ''} 
                        ${anime.episodes.dub ? `DUB: ${anime.episodes.dub}` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.showAnimeDetail(anime.id);
        });
        
        return card;
    }

    /**
     * Show anime detail screen
     */
    async showAnimeDetail(animeId) {
        try {
            console.log('Loading anime details for:', animeId);
            this.showLoading();
            
            const data = await AnimeAPI.getAnimeInfo(animeId);
            
            if (data.success) {
                this.renderAnimeDetail(data.data);
                this.showScreen('anime-detail');
            } else {
                throw new Error('Failed to load anime details');
            }
        } catch (error) {
            console.error('Error loading anime details:', error);
            this.showError('Failed to load anime details');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Render anime detail screen
     */
    renderAnimeDetail(animeData) {
        const container = document.getElementById('anime-detail-content');
        if (!container || !animeData.anime) return;

        const anime = animeData.anime.info;
        
        container.innerHTML = `
            <div class="anime-detail-hero">
                <img src="${anime.poster}" alt="${this.escapeHtml(anime.name)}" class="anime-detail-poster">
                <div class="anime-detail-info">
                    <h1 class="anime-detail-title">${this.escapeHtml(anime.name)}</h1>
                    <div class="anime-detail-meta">
                        <span>⭐ ${anime.stats?.rating || 'N/A'}</span>
                        <span>${anime.stats?.type || 'Unknown'}</span>
                        <span>${anime.stats?.duration || 'Unknown duration'}</span>
                        ${anime.stats?.episodes ? `<span>Episodes: ${anime.stats.episodes.sub || 0}</span>` : ''}
                    </div>
                    <p class="anime-detail-description">${this.escapeHtml(anime.description || 'No description available.')}</p>
                    <div class="anime-detail-actions">
                        <button class="action-btn primary focusable" data-action="watch" data-anime-id="${animeData.anime.info.id}">
                            Watch Now
                        </button>
                        <button class="action-btn secondary focusable" data-action="episodes" data-anime-id="${animeData.anime.info.id}">
                            View Episodes
                        </button>
                    </div>
                </div>
            </div>
            
            ${animeData.recommendedAnimes && animeData.recommendedAnimes.length > 0 ? `
                <div class="content-section">
                    <h3 class="section-title">Recommended</h3>
                    <div id="recommended-grid" class="anime-grid">
                        <!-- Recommended animes will be loaded here -->
                    </div>
                </div>
            ` : ''}
        `;
        
        // Add event listeners for action buttons
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const animeId = e.target.dataset.animeId;
                
                if (action === 'watch') {
                    this.startWatching(animeId);
                } else if (action === 'episodes') {
                    this.showEpisodes(animeId);
                }
            });
        });
        
        // Render recommended animes
        if (animeData.recommendedAnimes) {
            this.renderSection('recommended-grid', animeData.recommendedAnimes);
        }
    }

    /**
     * Start watching anime (load first episode)
     */
    async startWatching(animeId) {
        try {
            console.log('Loading episodes for:', animeId);
            this.showLoading();
            
            const episodesData = await AnimeAPI.getAnimeEpisodes(animeId);
            
            if (episodesData.success && episodesData.data.episodes.length > 0) {
                const firstEpisode = episodesData.data.episodes[0];
                this.playEpisode(firstEpisode.episodeId, firstEpisode.title);
            } else {
                throw new Error('No episodes available');
            }
        } catch (error) {
            console.error('Error starting watch:', error);
            this.showError('Unable to start watching. No episodes available.');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show episodes list
     */
    async showEpisodes(animeId) {
        try {
            console.log('Loading episodes list for:', animeId);
            this.showLoading();
            
            const episodesData = await AnimeAPI.getAnimeEpisodes(animeId);
            
            if (episodesData.success) {
                this.renderEpisodesList(episodesData.data);
            } else {
                throw new Error('Failed to load episodes');
            }
        } catch (error) {
            console.error('Error loading episodes:', error);
            this.showError('Failed to load episodes list');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Render episodes list
     */
    renderEpisodesList(episodesData) {
        const container = document.getElementById('anime-detail-content');
        if (!container) return;

        const episodesSection = document.createElement('div');
        episodesSection.className = 'episodes-section';
        episodesSection.innerHTML = `
            <h3 class="section-title">Episodes (${episodesData.totalEpisodes})</h3>
            <div class="episodes-grid">
                ${episodesData.episodes.map(episode => `
                    <div class="episode-card focusable" data-episode-id="${episode.episodeId}">
                        <div class="episode-number">Episode ${episode.number}</div>
                        <div class="episode-title">${this.escapeHtml(episode.title)}</div>
                        ${episode.isFiller ? '<div class="episode-filler">Filler</div>' : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(episodesSection);
        
        // Add click handlers for episodes
        episodesSection.querySelectorAll('.episode-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const episodeId = e.currentTarget.dataset.episodeId;
                const episodeTitle = e.currentTarget.querySelector('.episode-title').textContent;
                this.playEpisode(episodeId, episodeTitle);
            });
        });
    }

    /**
     * Play episode
     */
    async playEpisode(episodeId, episodeTitle) {
        try {
            console.log('Loading episode sources for:', episodeId);
            this.showLoading();
            
            // Get episode servers
            const serversData = await AnimeAPI.getEpisodeServers(episodeId);
            
            if (serversData.success) {
                // Try to get sources from the first available server
                const servers = serversData.data.sub.length > 0 ? serversData.data.sub : 
                              serversData.data.dub.length > 0 ? serversData.data.dub : 
                              serversData.data.raw;
                
                if (servers.length > 0) {
                    const category = serversData.data.sub.length > 0 ? 'sub' : 
                                   serversData.data.dub.length > 0 ? 'dub' : 'raw';
                    
                    const sourcesData = await AnimeAPI.getEpisodeSources(episodeId, servers[0].serverName, category);
                    
                    if (sourcesData.success && sourcesData.data.sources.length > 0) {
                        this.startVideoPlayback(sourcesData.data, episodeTitle);
                    } else {
                        throw new Error('No video sources available');
                    }
                } else {
                    throw new Error('No servers available');
                }
            } else {
                throw new Error('Failed to load episode servers');
            }
        } catch (error) {
            console.error('Error playing episode:', error);
            this.showError('Unable to play episode. Please try again later.');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Start video playback
     */
    startVideoPlayback(sourcesData, episodeTitle) {
        // Show video player screen
        this.showScreen('video-player');
        
        // Set video title
        const titleEl = document.getElementById('video-title');
        if (titleEl) {
            titleEl.textContent = episodeTitle;
        }
        
        // Initialize video player with sources
        if (window.VideoPlayerManager) {
            window.VideoPlayerManager.loadVideo(sourcesData);
        } else {
            console.error('Video player manager not available');
        }
    }

    /**
     * Perform search
     */
    async performSearch() {
        const searchInput = document.getElementById('search-input');
        const query = searchInput ? searchInput.value.trim() : '';
        
        if (!query) {
            WebOSAPI.showToast('Please enter a search term');
            return;
        }
        
        try {
            console.log('Searching for:', query);
            this.showLoading();
            
            const searchData = await AnimeAPI.searchAnime(query);
            
            if (searchData.success) {
                this.renderSearchResults(searchData.data);
            } else {
                throw new Error('Search failed');
            }
        } catch (error) {
            console.error('Error searching:', error);
            this.showError('Search failed. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Render search results
     */
    renderSearchResults(searchData) {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (!searchData.animes || searchData.animes.length === 0) {
            container.innerHTML = '<div class="search-no-results">No results found. Try different keywords.</div>';
            return;
        }

        container.innerHTML = '';
        searchData.animes.forEach(anime => {
            const card = this.createAnimeCard(anime);
            container.appendChild(card);
        });
    }

    /**
     * Show screen
     */
    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
        
        // Update navigation menu
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.screen === screenName) {
                item.classList.add('active');
            }
        });
        
        // Show main content and navigation if not already visible
        const mainNav = document.getElementById('main-nav');
        const mainContent = document.getElementById('main-content');
        
        if (mainNav) mainNav.classList.remove('hidden');
        if (mainContent) mainContent.classList.remove('hidden');
        
        // Special handling for certain screens
        if (screenName === 'search') {
            // Focus search input
            setTimeout(() => {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }

    /**
     * Handle screen change
     */
    handleScreenChange(screenName) {
        this.showScreen(screenName);
        
        // Load screen-specific data
        if (screenName === 'trending') {
            this.loadTrendingData();
        } else if (screenName === 'categories') {
            this.loadCategoriesData();
        }
    }

    /**
     * Load trending data
     */
    async loadTrendingData() {
        try {
            const data = await AnimeAPI.getAnimeByCategory('most-popular');
            if (data.success) {
                this.renderTrendingList(data.data);
            }
        } catch (error) {
            console.error('Error loading trending data:', error);
        }
    }

    /**
     * Render trending list
     */
    renderTrendingList(data) {
        const container = document.getElementById('trending-list');
        if (!container || !data.animes) return;

        container.innerHTML = '';
        data.animes.forEach(anime => {
            const card = this.createAnimeCard(anime);
            container.appendChild(card);
        });
    }

    /**
     * Load categories data
     */
    loadCategoriesData() {
        const container = document.getElementById('categories-grid');
        if (!container) return;

        const categories = [
            { name: 'Action', slug: 'action' },
            { name: 'Adventure', slug: 'adventure' },
            { name: 'Comedy', slug: 'comedy' },
            { name: 'Drama', slug: 'drama' },
            { name: 'Fantasy', slug: 'fantasy' },
            { name: 'Romance', slug: 'romance' },
            { name: 'Sci-Fi', slug: 'sci-fi' },
            { name: 'Thriller', slug: 'thriller' }
        ];

        container.innerHTML = categories.map(category => `
            <div class="category-card focusable" data-category="${category.slug}">
                <div class="category-title">${category.name}</div>
                <div class="category-count">Explore ${category.name} anime</div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.loadCategoryAnimes(category);
            });
        });
    }

    /**
     * Load category animes
     */
    async loadCategoryAnimes(category) {
        try {
            console.log('Loading category:', category);
            this.showLoading();
            
            const data = await AnimeAPI.getAnimeByGenre(category);
            
            if (data.success) {
                this.renderCategoryResults(data.data, category);
            } else {
                throw new Error('Failed to load category');
            }
        } catch (error) {
            console.error('Error loading category:', error);
            this.showError('Failed to load category');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Render category results
     */
    renderCategoryResults(data, categoryName) {
        const container = document.getElementById('categories-grid');
        if (!container) return;

        container.innerHTML = `
            <div class="category-results">
                <h3 class="section-title">${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Anime</h3>
                <div class="anime-grid">
                    ${data.animes ? data.animes.map(anime => this.createAnimeCard(anime).outerHTML).join('') : ''}
                </div>
            </div>
        `;
    }

    /**
     * Show loading indicator
     */
    showLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
        
        // Show main content and sidebar navigation after loading
        this.showNavigation();
        this.showMainContent();
    }

    /**
     * Show navigation
     */
    showNavigation() {
        const sidebarNav = document.getElementById('sidebar-nav');
        if (sidebarNav) {
            sidebarNav.classList.remove('hidden');
        }
    }

    /**
     * Show main content
     */
    showMainContent() {
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.classList.remove('hidden');
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        WebOSAPI.showToast(message, 5000);
    }

    /**
     * Hide help overlay
     */
    hideHelp() {
        const helpOverlay = document.getElementById('help-overlay');
        if (helpOverlay) {
            helpOverlay.classList.add('hidden');
        }
    }

    /**
     * Navigate to different screens
     */
    navigateToScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId + '-screen');
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        // Update navigation state
        if (window.navigationManager) {
            window.navigationManager.refresh();
        }
    }

    /**
     * Update active navigation item
     */
    updateActiveNavItem(activeItem) {
        // Remove active class from all nav items
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected item
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    /**
     * Show screen
     */
    showScreen(screenName) {
        console.log('Showing screen:', screenName);
        
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            
            // Load screen-specific data
            this.loadScreenData(screenName);
        }
        
        // Show navigation and main content
        this.showNavigation();
        this.showMainContent();
        
        // Update navigation focus
        if (window.navigationManager) {
            window.navigationManager.currentScreen = screenName;
            setTimeout(() => {
                window.navigationManager.refresh();
            }, 100);
        }
    }

    /**
     * Load screen-specific data
     */
    loadScreenData(screenName) {
        switch (screenName) {
            case 'home':
                if (!this.currentData) {
                    this.loadHomeData();
                }
                break;
            case 'search':
                // Focus search input
                setTimeout(() => {
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.focus();
                    }
                }, 200);
                break;
            case 'trending':
                this.loadTrendingData();
                break;
            case 'categories':
                this.loadCategoriesData();
                break;
            case 'favorites':
                this.loadFavoritesData();
                break;
        }
    }

    /**
     * Load favorites data (placeholder)
     */
    loadFavoritesData() {
        const favoritesScreen = document.getElementById('favorites-screen');
        if (!favoritesScreen) {
            // Create favorites screen if it doesn't exist
            const mainContent = document.querySelector('.main-content');
            const favoritesScreenHTML = `
                <section id="favorites-screen" class="screen">
                    <div class="search-container">
                        <h2 class="screen-title">My Favorites</h2>
                        <div id="favorites-list" class="search-results">
                            <div class="search-no-results">
                                <p>No favorites added yet.</p>
                                <p>Start exploring anime and add them to your favorites!</p>
                            </div>
                        </div>
                    </div>
                </section>
            `;
            mainContent.insertAdjacentHTML('beforeend', favoritesScreenHTML);
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}