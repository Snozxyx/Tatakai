'use client'

import { useState, useEffect } from 'react'
import { 
  Settings, 
  Monitor, 
  Volume2, 
  Globe, 
  User, 
  Shield,
  Wifi,
  Palette,
  ArrowLeft,
  Check,
  Contrast,
  ZoomIn
} from 'lucide-react'
import { useBackNavigation, useTVKeyListener } from '../../lib/focus-management'
import { motion, AnimatePresence } from 'framer-motion'

interface SettingsProps {
  onClose: () => void
}

interface SettingsCategory {
  id: string
  title: string
  icon: React.ComponentType<any>
  description: string
}

interface SettingItem {
  id: string
  title: string
  description: string
  type: 'toggle' | 'select' | 'slider' | 'info'
  value?: boolean | string | number
  options?: Array<{ label: string; value: string | number }>
  min?: number
  max?: number
}

const settingsCategories: SettingsCategory[] = [
  {
    id: 'display',
    title: 'Display & Video',
    icon: Monitor,
    description: 'Video quality, display settings, and visual preferences'
  },
  {
    id: 'audio',
    title: 'Audio',
    icon: Volume2,
    description: 'Sound settings, volume, and audio preferences'
  },
  {
    id: 'language',
    title: 'Language & Region',
    icon: Globe,
    description: 'Language, subtitles, and regional settings'
  },
  {
    id: 'account',
    title: 'Account',
    icon: User,
    description: 'Profile settings and account management'
  },
  {
    id: 'privacy',
    title: 'Privacy & Security',
    icon: Shield,
    description: 'Privacy settings and security options'
  },
  {
    id: 'network',
    title: 'Network',
    icon: Wifi,
    description: 'Connection settings and network diagnostics'
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    icon: Contrast,
    description: 'Accessibility features and customization'
  }
]

const settingsData: Record<string, SettingItem[]> = {
  display: [
    {
      id: 'video_quality',
      title: 'Default Video Quality',
      description: 'Preferred video quality for streaming',
      type: 'select',
      value: 'auto',
      options: [
        { label: 'Auto (Recommended)', value: 'auto' },
        { label: '1080p', value: '1080p' },
        { label: '720p', value: '720p' },
        { label: '480p', value: '480p' }
      ]
    },
    {
      id: 'autoplay',
      title: 'Autoplay Next Episode',
      description: 'Automatically play the next episode when current one ends',
      type: 'toggle',
      value: true
    },
    {
      id: 'skip_intro',
      title: 'Skip Intro',
      description: 'Automatically skip opening sequences',
      type: 'toggle',
      value: false
    },
    {
      id: 'ui_scale',
      title: 'Interface Scale',
      description: 'Adjust the size of UI elements for better visibility',
      type: 'select',
      value: 'normal',
      options: [
        { label: 'Small', value: 'small' },
        { label: 'Normal', value: 'normal' },
        { label: 'Large', value: 'large' },
        { label: 'Extra Large', value: 'xl' }
      ]
    }
  ],
  audio: [
    {
      id: 'default_audio',
      title: 'Default Audio Language',
      description: 'Preferred audio language',
      type: 'select',
      value: 'japanese',
      options: [
        { label: 'Japanese (Original)', value: 'japanese' },
        { label: 'English (Dub)', value: 'english' },
        { label: 'Auto (Based on availability)', value: 'auto' }
      ]
    },
    {
      id: 'volume_boost',
      title: 'Volume Boost',
      description: 'Enhance audio for better TV speakers',
      type: 'toggle',
      value: false
    },
    {
      id: 'surround_sound',
      title: 'Surround Sound',
      description: 'Enable surround sound for compatible systems',
      type: 'toggle',
      value: true
    }
  ],
  language: [
    {
      id: 'app_language',
      title: 'App Language',
      description: 'Language for menus and interface',
      type: 'select',
      value: 'english',
      options: [
        { label: 'English', value: 'english' },
        { label: 'Japanese', value: 'japanese' },
        { label: 'Spanish', value: 'spanish' },
        { label: 'French', value: 'french' },
        { label: 'German', value: 'german' }
      ]
    },
    {
      id: 'subtitle_language',
      title: 'Default Subtitle Language',
      description: 'Preferred subtitle language',
      type: 'select',
      value: 'english',
      options: [
        { label: 'Off', value: 'off' },
        { label: 'English', value: 'english' },
        { label: 'Japanese', value: 'japanese' },
        { label: 'Spanish', value: 'spanish' },
        { label: 'French', value: 'french' }
      ]
    },
    {
      id: 'subtitle_size',
      title: 'Subtitle Size',
      description: 'Size of subtitle text',
      type: 'select',
      value: 'medium',
      options: [
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
        { label: 'Extra Large', value: 'xl' }
      ]
    }
  ],
  accessibility: [
    {
      id: 'high_contrast',
      title: 'High Contrast Mode',
      description: 'Increase contrast for better visibility',
      type: 'toggle',
      value: false
    },
    {
      id: 'focus_enhancement',
      title: 'Enhanced Focus Indicators',
      description: 'Make focus outlines more prominent',
      type: 'toggle',
      value: false
    },
    {
      id: 'reduced_motion',
      title: 'Reduce Motion',
      description: 'Minimize animations and transitions',
      type: 'toggle',
      value: false
    },
    {
      id: 'text_size',
      title: 'Text Size',
      description: 'Adjust text size for better readability',
      type: 'select',
      value: 'normal',
      options: [
        { label: 'Small', value: 'small' },
        { label: 'Normal', value: 'normal' },
        { label: 'Large', value: 'large' },
        { label: 'Extra Large', value: 'xl' }
      ]
    }
  ]
}

export function SettingsPanel({ onClose }: SettingsProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('display')
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [focusedItem, setFocusedItem] = useState<string>('')

  // Handle Back navigation
  useBackNavigation(() => {
    onClose()
  })

  // Handle TV remote navigation
  useTVKeyListener(['LEFT'], () => {
    // Focus back to category list
    const firstCategory = settingsCategories[0]
    setFocusedItem(`category-${firstCategory.id}`)
  })

  useTVKeyListener(['RIGHT'], () => {
    // Focus first setting item
    const firstSetting = settingsData[selectedCategory]?.[0]
    if (firstSetting) {
      setFocusedItem(`setting-${firstSetting.id}`)
    }
  })

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('tatakaiSettings')
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  // Save settings to localStorage
  const saveSettings = (newSettings: Record<string, any>) => {
    setSettings(newSettings)
    localStorage.setItem('tatakaiSettings', JSON.stringify(newSettings))
  }

  const updateSetting = (settingId: string, value: any) => {
    const newSettings = { ...settings, [settingId]: value }
    saveSettings(newSettings)
  }

  const getSettingValue = (settingId: string, defaultValue: any) => {
    return settings[settingId] !== undefined ? settings[settingId] : defaultValue
  }

  const renderSettingControl = (setting: SettingItem) => {
    const currentValue = getSettingValue(setting.id, setting.value)

    switch (setting.type) {
      case 'toggle':
        return (
          <button
            className={`relative w-16 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
              currentValue ? 'bg-accent' : 'bg-surface-elevated'
            }`}
            onClick={() => updateSetting(setting.id, !currentValue)}
            onFocus={() => setFocusedItem(`setting-${setting.id}`)}
            data-focusable="true"
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                currentValue ? 'transform translate-x-8' : 'transform translate-x-1'
              }`}
            />
          </button>
        )

      case 'select':
        return (
          <select
            className="bg-surface-elevated text-white p-3 rounded-lg border border-border-light focus:border-accent focus:outline-none min-w-48"
            value={currentValue}
            onChange={(e) => updateSetting(setting.id, e.target.value)}
            onFocus={() => setFocusedItem(`setting-${setting.id}`)}
            data-focusable="true"
          >
            {setting.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )

      case 'info':
        return (
          <span className="text-text-secondary text-tv-base">
            {currentValue}
          </span>
        )

      default:
        return null
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50"
    >
      {/* Header */}
      <div className="tv-safe-x py-6 border-b border-border-light">
        <div className="flex items-center space-x-6">
          <button 
            className="focusable p-3 rounded-lg"
            onClick={onClose}
            onFocus={() => setFocusedItem('back-button')}
          >
            <ArrowLeft size={32} />
          </button>
          <div>
            <h1 className="text-tv-4xl font-bold text-text-primary">Settings</h1>
            <p className="text-tv-base text-text-secondary">Customize your Tatakai experience</p>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Categories Sidebar */}
        <div className="w-96 bg-surface border-r border-border-light p-6">
          <nav className="space-y-2">
            {settingsCategories.map((category) => {
              const Icon = category.icon
              return (
                <button
                  key={category.id}
                  className={`w-full text-left p-4 rounded-lg transition-all focusable ${
                    selectedCategory === category.id
                      ? 'bg-accent text-white'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  onClick={() => setSelectedCategory(category.id)}
                  onFocus={() => setFocusedItem(`category-${category.id}`)}
                  data-focusable="true"
                >
                  <div className="flex items-center space-x-4">
                    <Icon size={24} />
                    <div>
                      <div className="text-tv-base font-medium">{category.title}</div>
                      <div className="text-tv-sm opacity-75">{category.description}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl">
            <h2 className="text-tv-2xl font-bold text-text-primary mb-8">
              {settingsCategories.find(cat => cat.id === selectedCategory)?.title}
            </h2>

            <div className="space-y-8">
              {settingsData[selectedCategory]?.map((setting) => (
                <div
                  key={setting.id}
                  className="flex items-center justify-between p-6 bg-surface rounded-lg border border-border-light"
                >
                  <div className="flex-1 mr-8">
                    <h3 className="text-tv-lg font-semibold text-text-primary mb-2">
                      {setting.title}
                    </h3>
                    <p className="text-tv-base text-text-secondary">
                      {setting.description}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0">
                    {renderSettingControl(setting)}
                  </div>
                </div>
              ))}
            </div>

            {/* Category-specific additional content */}
            {selectedCategory === 'network' && (
              <div className="mt-8 p-6 bg-surface rounded-lg border border-border-light">
                <h3 className="text-tv-lg font-semibold text-text-primary mb-4">
                  Connection Status
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Connection Type</span>
                    <span className="text-text-secondary">WiFi</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Signal Strength</span>
                    <span className="text-accent">Excellent</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Speed</span>
                    <span className="text-text-secondary">50 Mbps</span>
                  </div>
                </div>
              </div>
            )}

            {selectedCategory === 'account' && (
              <div className="mt-8 space-y-6">
                <div className="p-6 bg-surface rounded-lg border border-border-light">
                  <h3 className="text-tv-lg font-semibold text-text-primary mb-4">
                    Profile Information
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Username</span>
                      <span className="text-text-secondary">AnimeViewer</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Viewing Time</span>
                      <span className="text-text-secondary">247 hours</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Watched Episodes</span>
                      <span className="text-text-secondary">1,234</span>
                    </div>
                  </div>
                </div>

                <button className="btn-primary focusable">
                  Manage Watchlist
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}