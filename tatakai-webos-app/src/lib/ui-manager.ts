import { ApiClient } from './api-client'
import { BackendApiClient } from './backend-api-client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { Input } from '../components/ui/input'

export class UIManager {
  constructor(
    private apiClient: ApiClient,
    private backendClient: BackendApiClient
  ) {}

  async initialize() {
    await this.loadHomeContent()
    this.setupSettings()
    this.setupSearch()
  }

  private async loadHomeContent() {
    try {
      // Load featured anime for hero section
      const featured = await this.apiClient.getFeaturedAnime()
      if (featured) {
        this.updateHeroSection(featured)
      }

      // Load trending anime
      const trending = await this.apiClient.fetchTrendingAnime()
      this.populateContentGrid('trending-grid', trending.slice(0, 12))
      this.populateContentGrid('popular-grid', trending.slice(12, 24))
      this.populateContentGrid('latest-grid', trending.slice(6, 18))

    } catch (error) {
      console.error('Error loading home content:', error)
    }
  }

  private updateHeroSection(anime: any) {
    const heroContent = document.getElementById('hero-content')
    if (!heroContent) return

    const titleElement = heroContent.querySelector('h1')
    if (titleElement) {
      titleElement.textContent = anime.title
    }

    // Set background image if available
    if (anime.image) {
      const heroSection = heroContent.closest('.webos-hero') as HTMLElement
      if (heroSection) {
        heroSection.style.backgroundImage = `linear-gradient(rgba(15, 15, 35, 0.7), rgba(15, 15, 35, 0.7)), url(${anime.image})`
        heroSection.style.backgroundSize = 'cover'
        heroSection.style.backgroundPosition = 'center'
      }
    }
  }

  private populateContentGrid(gridId: string, animes: any[]) {
    const grid = document.getElementById(gridId)
    if (!grid) return

    grid.innerHTML = animes.map(anime => `
      <div class="webos-card focusable cursor-pointer transform hover:scale-105 transition-transform" data-anime-id="${anime.id}">
        <div class="aspect-[3/4] overflow-hidden rounded-lg mb-4">
          <img src="${anime.image}" alt="${anime.title}" class="w-full h-full object-cover">
        </div>
        <h4 class="text-lg font-semibold text-white truncate">${anime.title}</h4>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-tatakai-orange text-sm">★ ${anime.rating || 'N/A'}</span>
          <span class="text-gray-400 text-sm">${anime.episodes || '?'} eps</span>
        </div>
      </div>
    `).join('')

    // Add click handlers
    grid.querySelectorAll('[data-anime-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        const animeId = (e.currentTarget as HTMLElement).dataset.animeId
        if (animeId) {
          this.showAnimeDetails(animeId)
        }
      })
    })
  }

  private async showAnimeDetails(animeId: string) {
    try {
      const anime = await this.apiClient.getAnimeDetails(animeId)
      if (anime) {
        // Navigate to anime detail screen and populate it
        const navigation = new (await import('./navigation')).NavigationManager()
        navigation.navigateToScreen('anime-detail')
        this.populateAnimeDetails(anime)
      }
    } catch (error) {
      console.error('Error loading anime details:', error)
    }
  }

  private populateAnimeDetails(anime: any) {
    const titleElement = document.getElementById('anime-detail-title')
    const posterElement = document.getElementById('anime-detail-poster') as HTMLImageElement
    const descriptionElement = document.getElementById('anime-detail-description')
    const ratingElement = document.getElementById('anime-detail-rating')
    const episodesElement = document.getElementById('anime-detail-episodes')
    const statusElement = document.getElementById('anime-detail-status')

    if (titleElement) titleElement.textContent = anime.title
    if (posterElement) posterElement.src = anime.image
    if (descriptionElement) descriptionElement.textContent = anime.description || 'No description available.'
    if (ratingElement) ratingElement.textContent = `Rating: ${anime.rating || 'N/A'}`
    if (episodesElement) episodesElement.textContent = `Episodes: ${anime.episodes || 'N/A'}`
    if (statusElement) statusElement.textContent = `Status: ${anime.status || 'N/A'}`
  }

  private setupSettings() {
    const settingsScreen = document.getElementById('settings-screen')
    if (!settingsScreen) return

    // Create modern settings UI with shadcn/ui components
    const settingsHTML = `
      <div class="p-8 max-w-4xl mx-auto">
        <h2 class="text-4xl font-bold mb-8 text-white">Settings</h2>
        
        <div class="space-y-8">
          <!-- Playback Settings -->
          <div class="webos-card">
            <h3 class="text-2xl font-semibold mb-6 text-white">Playback</h3>
            <div class="space-y-6">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Auto-skip Intros</label>
                  <p class="text-gray-400">Automatically skip anime opening sequences</p>
                </div>
                <div class="switch-container" data-setting="auto-skip-intros">
                  <input type="checkbox" id="auto-skip-intros" class="hidden">
                  <label for="auto-skip-intros" class="switch-label">
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Auto-skip Outros</label>
                  <p class="text-gray-400">Automatically skip anime ending sequences</p>
                </div>
                <div class="switch-container" data-setting="auto-skip-outros">
                  <input type="checkbox" id="auto-skip-outros" class="hidden">
                  <label for="auto-skip-outros" class="switch-label">
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Video Quality</label>
                  <p class="text-gray-400">Default video playback quality</p>
                </div>
                <select class="webos-input w-48" data-setting="video-quality">
                  <option value="auto">Auto</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </div>
            </div>
          </div>
          
          <!-- Display Settings -->
          <div class="webos-card">
            <h3 class="text-2xl font-semibold mb-6 text-white">Display</h3>
            <div class="space-y-6">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Theme</label>
                  <p class="text-gray-400">Choose app theme</p>
                </div>
                <select class="webos-input w-48" data-setting="theme">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Language</label>
                  <p class="text-gray-400">App display language</p>
                </div>
                <select class="webos-input w-48" data-setting="language">
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                </select>
              </div>
            </div>
          </div>
          
          <!-- Account Settings -->
          <div class="webos-card">
            <h3 class="text-2xl font-semibold mb-6 text-white">Account</h3>
            <div class="space-y-6">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Sync Watch History</label>
                  <p class="text-gray-400">Sync progress across devices</p>
                </div>
                <div class="switch-container" data-setting="sync-history">
                  <input type="checkbox" id="sync-history" class="hidden" checked>
                  <label for="sync-history" class="switch-label">
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
              
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-lg font-medium text-white">Clear Cache</label>
                  <p class="text-gray-400">Clear app cache and data</p>
                </div>
                <button class="webos-button-secondary" id="clear-cache-btn">
                  <i class="fas fa-trash mr-2"></i>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    settingsScreen.innerHTML = settingsHTML
    this.loadSettingsValues()
    this.setupSettingsHandlers()
  }

  private async loadSettingsValues() {
    try {
      const settings = await this.backendClient.getSettings()
      
      // Update switch states
      const autoSkipIntros = document.getElementById('auto-skip-intros') as HTMLInputElement
      const autoSkipOutros = document.getElementById('auto-skip-outros') as HTMLInputElement
      const syncHistory = document.getElementById('sync-history') as HTMLInputElement
      
      if (autoSkipIntros) autoSkipIntros.checked = settings.autoSkipIntros
      if (autoSkipOutros) autoSkipOutros.checked = settings.autoSkipOutros
      if (syncHistory) syncHistory.checked = settings.syncHistory
      
      // Update select values
      const qualitySelect = document.querySelector('[data-setting="video-quality"]') as HTMLSelectElement
      const themeSelect = document.querySelector('[data-setting="theme"]') as HTMLSelectElement
      const languageSelect = document.querySelector('[data-setting="language"]') as HTMLSelectElement
      
      if (qualitySelect) qualitySelect.value = settings.videoQuality
      if (themeSelect) themeSelect.value = settings.theme
      if (languageSelect) languageSelect.value = settings.language
      
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  private setupSettingsHandlers() {
    // Handle checkbox changes
    document.querySelectorAll('.switch-container input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement
        const setting = target.closest('.switch-container')?.dataset.setting
        if (setting) {
          const settingKey = this.mapSettingKey(setting)
          await this.backendClient.updateSettings({ [settingKey]: target.checked })
        }
      })
    })

    // Handle select changes
    document.querySelectorAll('select[data-setting]').forEach(select => {
      select.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement
        const setting = target.dataset.setting
        if (setting) {
          const settingKey = this.mapSettingKey(setting)
          await this.backendClient.updateSettings({ [settingKey]: target.value })
        }
      })
    })

    // Handle clear cache button
    const clearCacheBtn = document.getElementById('clear-cache-btn')
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        try {
          await this.backendClient.clearCache()
          // Show success message (could be improved with a toast notification)
          console.log('Cache cleared successfully')
        } catch (error) {
          console.error('Error clearing cache:', error)
        }
      })
    }
  }

  private mapSettingKey(htmlKey: string): string {
    const mapping: { [key: string]: string } = {
      'auto-skip-intros': 'autoSkipIntros',
      'auto-skip-outros': 'autoSkipOutros',
      'auto-play-next': 'autoPlayNext',
      'video-quality': 'videoQuality',
      'theme': 'theme',
      'language': 'language',
      'subtitle-language': 'subtitleLanguage',
      'sync-history': 'syncHistory'
    }
    return mapping[htmlKey] || htmlKey
  }

  private setupSearch() {
    const searchInput = document.getElementById('search-input') as HTMLInputElement
    const searchBtn = document.getElementById('search-btn')
    const searchResults = document.getElementById('search-results')

    if (!searchInput || !searchBtn || !searchResults) return

    let searchTimeout: NodeJS.Timeout

    const performSearch = async () => {
      const query = searchInput.value.trim()
      if (!query) {
        searchResults.innerHTML = ''
        return
      }

      try {
        searchResults.innerHTML = '<div class="text-center text-gray-400 py-8">Searching...</div>'
        
        const results = await this.apiClient.searchAnime(query)
        
        if (results.length === 0) {
          searchResults.innerHTML = '<div class="text-center text-gray-400 py-8">No results found</div>'
          return
        }

        this.populateContentGrid('search-results', results)
      } catch (error) {
        console.error('Search error:', error)
        searchResults.innerHTML = '<div class="text-center text-red-400 py-8">Search failed. Please try again.</div>'
      }
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout)
      searchTimeout = setTimeout(performSearch, 500)
    })

    searchBtn.addEventListener('click', performSearch)
  }
}