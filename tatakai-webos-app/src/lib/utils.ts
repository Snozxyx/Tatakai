import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function formatTimeAgo(date: string | Date): string {
  const now = new Date()
  const past = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)
  
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return `${Math.floor(diffInSeconds / 604800)}w ago`
}

export function getImageUrl(url: string): string {
  if (!url) return '/placeholder-anime.jpg'
  if (url.startsWith('http')) return url
  return `https://cdn.aniwatch.to${url}`
}

// webOS specific utilities
export function isWebOS(): boolean {
  return typeof window !== 'undefined' && window.webOS !== undefined
}

export function goBack(): void {
  if (isWebOS() && window.webOS?.platformBack) {
    window.webOS.platformBack()
  } else {
    window.history.back()
  }
}

export function getDeviceInfo(): Promise<any> {
  return new Promise((resolve) => {
    if (isWebOS() && window.webOS?.deviceInfo) {
      window.webOS.deviceInfo(resolve)
    } else {
      resolve({
        modelName: 'Development',
        version: '1.0.0',
        platform: 'web'
      })
    }
  })
}