'use client'

// LG webOS TV integration layer
// Handles webOS-specific APIs and platform detection

interface WebOSSystemInfo {
  modelName: string
  firmwareVersion: string
  sdkVersion: string
  screenWidth: number
  screenHeight: number
}

interface WebOSServiceResponse {
  returnValue: boolean
  errorCode?: string
  errorText?: string
}

declare global {
  interface Window {
    webOS?: {
      platform: {
        tv: boolean
      }
      deviceInfo: (callback: (info: WebOSSystemInfo) => void) => void
      service: {
        request: (uri: string, parameters: any, callback: (response: WebOSServiceResponse) => void) => void
      }
    }
    PalmSystem?: {
      stageReady: () => void
      activate: () => void
      deactivate: () => void
      stagePreparing: () => void
    }
    webOSTVjs?: any
  }
}

class WebOSIntegration {
  private isWebOS: boolean = false
  private isReady: boolean = false
  private callbacks: Array<() => void> = []

  constructor() {
    this.detectPlatform()
    this.initializeWebOS()
  }

  private detectPlatform() {
    // Check if running on webOS TV
    this.isWebOS = !!(
      typeof window !== 'undefined' && 
      (window.webOS?.platform?.tv || window.PalmSystem)
    )
    
    console.log('Platform detected:', this.isWebOS ? 'webOS TV' : 'Web Browser')
  }

  private initializeWebOS() {
    if (typeof window === 'undefined') return

    if (this.isWebOS) {
      // Initialize webOS TV APIs
      if (window.PalmSystem) {
        window.PalmSystem.stageReady()
      }

      // Load webOS TV JS library if available
      if (window.webOSTVjs) {
        console.log('webOS TV JS library loaded')
      }

      this.isReady = true
      this.executeCallbacks()
    } else {
      // Web browser fallback
      this.setupBrowserFallback()
      this.isReady = true
      this.executeCallbacks()
    }
  }

  private setupBrowserFallback() {
    // Mock webOS APIs for development
    if (typeof window !== 'undefined') {
      window.webOS = {
        platform: { tv: false },
        deviceInfo: (callback) => {
          callback({
            modelName: 'Development Browser',
            firmwareVersion: '1.0.0',
            sdkVersion: '1.0.0',
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight
          })
        },
        service: {
          request: (uri, parameters, callback) => {
            console.log('Mock webOS service call:', uri, parameters)
            callback({ returnValue: true })
          }
        }
      }
    }
  }

  private executeCallbacks() {
    this.callbacks.forEach(callback => callback())
    this.callbacks = []
  }

  // Check if running on webOS TV
  isWebOSTV(): boolean {
    return this.isWebOS
  }

  // Wait for webOS to be ready
  onReady(callback: () => void) {
    if (this.isReady) {
      callback()
    } else {
      this.callbacks.push(callback)
    }
  }

  // Get system information
  getSystemInfo(): Promise<WebOSSystemInfo> {
    return new Promise((resolve, reject) => {
      if (!window.webOS) {
        reject(new Error('webOS not available'))
        return
      }

      window.webOS.deviceInfo((info) => {
        resolve(info)
      })
    })
  }

  // Handle back button behavior
  handleBackButton(callback: () => void) {
    // For webOS, we need to handle the back button specially
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.keyCode === 8) { // Back key
        event.preventDefault()
        callback()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }

  // Exit the application
  exitApp() {
    if (this.isWebOS && window.webOS) {
      window.webOS.service.request('luna://com.webos.applicationManager/close', {
        id: 'com.tatakai.webostv'
      }, (response) => {
        console.log('App exit response:', response)
      })
    } else {
      // Browser fallback
      if (window.history.length > 1) {
        window.history.back()
      } else {
        window.close()
      }
    }
  }

  // Show toast notification
  showToast(message: string, duration: number = 3000) {
    if (this.isWebOS && window.webOS) {
      window.webOS.service.request('luna://com.webos.notification/createToast', {
        message,
        noAction: true
      }, (response) => {
        console.log('Toast response:', response)
      })
    } else {
      // Browser fallback - create custom toast
      this.createBrowserToast(message, duration)
    }
  }

  private createBrowserToast(message: string, duration: number) {
    const toast = document.createElement('div')
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #8A2BE2;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 16px;
      font-family: system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease-out;
    `
    
    toast.textContent = message
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in'
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, duration)
  }

  // Set cursor visibility
  setCursorVisibility(visible: boolean) {
    if (this.isWebOS && window.webOS) {
      window.webOS.service.request('luna://com.webos.service.ime/setCursorVisibility', {
        visibility: visible
      }, (response) => {
        console.log('Cursor visibility response:', response)
      })
    } else {
      // Browser fallback
      document.body.style.cursor = visible ? 'default' : 'none'
    }
  }

  // Handle app lifecycle events
  onPause(callback: () => void) {
    if (this.isWebOS && window.PalmSystem) {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          callback()
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    return () => {}
  }

  onResume(callback: () => void) {
    if (this.isWebOS && window.PalmSystem) {
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          callback()
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    return () => {}
  }

  // Network status monitoring
  onNetworkChange(callback: (isOnline: boolean) => void) {
    const handleOnline = () => callback(true)
    const handleOffline = () => callback(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }

  // Screen saver prevention
  preventScreenSaver() {
    if (this.isWebOS && window.webOS) {
      window.webOS.service.request('luna://com.webos.service.tvpower/power/turnOffDpm', {}, (response) => {
        console.log('Screen saver prevention response:', response)
      })
    }
  }

  // Launch external app (if needed)
  launchApp(appId: string, params: any = {}) {
    if (this.isWebOS && window.webOS) {
      window.webOS.service.request('luna://com.webos.applicationManager/launch', {
        id: appId,
        params
      }, (response) => {
        console.log('App launch response:', response)
      })
    }
  }
}

// Export singleton instance
export const webOSIntegration = new WebOSIntegration()

// React hook for webOS integration
export function useWebOS() {
  const [isReady, setIsReady] = React.useState(false)
  const [systemInfo, setSystemInfo] = React.useState<WebOSSystemInfo | null>(null)

  React.useEffect(() => {
    webOSIntegration.onReady(() => {
      setIsReady(true)
      
      if (webOSIntegration.isWebOSTV()) {
        webOSIntegration.getSystemInfo().then(setSystemInfo).catch(console.error)
      }
    })
  }, [])

  return {
    isReady,
    isWebOSTV: webOSIntegration.isWebOSTV(),
    systemInfo,
    webOS: webOSIntegration
  }
}

import React from 'react'