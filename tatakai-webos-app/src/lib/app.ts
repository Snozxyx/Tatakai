import { NavigationManager } from './navigation'
import { UIManager } from './ui-manager'
import { ApiClient } from './api-client'
import { BackendApiClient } from './backend-api-client'

export class TatakaiApp {
  private navigation: NavigationManager
  private uiManager: UIManager
  private apiClient: ApiClient
  private backendClient: BackendApiClient

  constructor() {
    this.apiClient = new ApiClient()
    this.backendClient = new BackendApiClient()
    this.navigation = new NavigationManager()
    this.uiManager = new UIManager(this.apiClient, this.backendClient)
  }

  async initialize() {
    console.log('Initializing Tatakai webOS App...')
    
    // Hide loading screen and show main content
    const loadingScreen = document.getElementById('loading-screen')
    const sidebarNav = document.getElementById('sidebar-nav')
    const mainContent = document.getElementById('main-content')

    if (loadingScreen) {
      setTimeout(() => {
        loadingScreen.classList.add('hidden')
        sidebarNav?.classList.remove('hidden')
        mainContent?.classList.remove('hidden')
      }, 2000)
    }

    // Initialize components
    await this.navigation.initialize()
    await this.uiManager.initialize()

    console.log('Tatakai webOS App initialized successfully!')
  }
}

export async function initializeApp() {
  const app = new TatakaiApp()
  await app.initialize()
}