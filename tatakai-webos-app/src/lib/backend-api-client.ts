interface UserSettings {
  autoSkipIntros: boolean
  autoSkipOutros: boolean
  autoPlayNext: boolean
  videoQuality: string
  theme: string
  language: string
  subtitleLanguage: string
  syncHistory: boolean
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export class BackendApiClient {
  private readonly baseUrl: string
  private isOnline: boolean = false

  constructor() {
    // Try different backend URLs for development and production
    this.baseUrl = this.detectBackendUrl()
    this.checkConnection()
  }

  private detectBackendUrl(): string {
    const hostname = window.location.hostname
    
    // Development environment
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001/api'
    }
    
    // Production or webOS environment
    return '/api'
  }

  private async checkConnection(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      this.isOnline = response.ok
    } catch (error) {
      this.isOnline = false
    }
  }

  async getSettings(): Promise<UserSettings> {
    const defaultSettings: UserSettings = {
      autoSkipIntros: false,
      autoSkipOutros: false,
      autoPlayNext: true,
      videoQuality: 'auto',
      theme: 'dark',
      language: 'en',
      subtitleLanguage: 'en',
      syncHistory: true
    }

    if (!this.isOnline) {
      // Fallback to localStorage
      const stored = localStorage.getItem('tatakai-settings')
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
    }

    try {
      const response = await fetch(`${this.baseUrl}/settings`, {
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        const data: ApiResponse<UserSettings> = await response.json()
        return data.data || defaultSettings
      }
    } catch (error) {
      console.error('Failed to fetch settings from backend:', error)
    }

    return defaultSettings
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<boolean> {
    // Always update localStorage as fallback
    const currentSettings = await this.getSettings()
    const newSettings = { ...currentSettings, ...settings }
    localStorage.setItem('tatakai-settings', JSON.stringify(newSettings))

    if (!this.isOnline) {
      return true
    }

    try {
      const response = await fetch(`${this.baseUrl}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      
      return response.ok
    } catch (error) {
      console.error('Failed to update settings on backend:', error)
      return true // Still return true since localStorage was updated
    }
  }

  async clearCache(): Promise<boolean> {
    // Clear localStorage
    localStorage.removeItem('tatakai-settings')
    localStorage.removeItem('tatakai-watch-history')
    localStorage.removeItem('tatakai-favorites')

    if (!this.isOnline) {
      return true
    }

    try {
      const response = await fetch(`${this.baseUrl}/settings/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      return response.ok
    } catch (error) {
      console.error('Failed to clear cache on backend:', error)
      return true // Still return true since local cache was cleared
    }
  }

  async trackEvent(eventType: string, data: any): Promise<void> {
    if (!this.isOnline) return

    try {
      await fetch(`${this.baseUrl}/analytics/track-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, data, timestamp: Date.now() })
      })
    } catch (error) {
      console.error('Failed to track event:', error)
    }
  }

  isBackendAvailable(): boolean {
    return this.isOnline
  }
}