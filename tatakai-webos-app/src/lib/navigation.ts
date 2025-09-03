export class NavigationManager {
  private currentScreen: string = 'home'
  private focusableElements: HTMLElement[] = []
  private currentFocusIndex: number = 0

  async initialize() {
    this.setupKeyboardNavigation()
    this.setupNavigationHandlers()
    this.updateFocusableElements()
  }

  private setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          this.navigateFocus(-1)
          break
        case 'ArrowDown':
          e.preventDefault()
          this.navigateFocus(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          this.handleHorizontalNavigation('left')
          break
        case 'ArrowRight':
          e.preventDefault()
          this.handleHorizontalNavigation('right')
          break
        case 'Enter':
          e.preventDefault()
          this.activateCurrentElement()
          break
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          this.handleBackNavigation()
          break
      }
    })
  }

  private setupNavigationHandlers() {
    const navItems = document.querySelectorAll('[data-screen]')
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement
        const screen = target.dataset.screen
        if (screen) {
          this.navigateToScreen(screen)
        }
      })
    })
  }

  private navigateFocus(direction: number) {
    if (this.focusableElements.length === 0) return

    this.currentFocusIndex = Math.max(0, Math.min(
      this.focusableElements.length - 1,
      this.currentFocusIndex + direction
    ))

    this.updateFocusDisplay()
  }

  private handleHorizontalNavigation(direction: 'left' | 'right') {
    // Handle horizontal navigation for content grids
    const currentElement = this.focusableElements[this.currentFocusIndex]
    if (currentElement?.closest('.content-row, .grid')) {
      // Implement grid navigation logic
      this.navigateGrid(direction)
    }
  }

  private navigateGrid(direction: 'left' | 'right') {
    // Implementation for grid navigation
    const step = direction === 'right' ? 1 : -1
    this.navigateFocus(step)
  }

  private activateCurrentElement() {
    const currentElement = this.focusableElements[this.currentFocusIndex]
    if (currentElement) {
      currentElement.click()
    }
  }

  private handleBackNavigation() {
    if (this.currentScreen !== 'home') {
      this.navigateToScreen('home')
    }
  }

  navigateToScreen(screenName: string) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active')
    })

    // Show target screen
    const targetScreen = document.getElementById(`${screenName}-screen`)
    if (targetScreen) {
      targetScreen.classList.add('active')
      this.currentScreen = screenName
      this.updateActiveNavItem(screenName)
      this.updateFocusableElements()
    }
  }

  private updateActiveNavItem(screenName: string) {
    document.querySelectorAll('.webos-nav-item').forEach(item => {
      item.classList.remove('active')
    })

    const activeItem = document.querySelector(`[data-screen="${screenName}"]`)
    if (activeItem) {
      activeItem.classList.add('active')
    }
  }

  private updateFocusableElements() {
    this.focusableElements = Array.from(document.querySelectorAll('.focusable:not(.hidden)'))
    this.currentFocusIndex = 0
    this.updateFocusDisplay()
  }

  private updateFocusDisplay() {
    this.focusableElements.forEach((element, index) => {
      if (index === this.currentFocusIndex) {
        element.classList.add('tv-focus')
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        element.classList.remove('tv-focus')
      }
    })
  }
}