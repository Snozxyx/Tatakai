import React, { useState } from 'react';
import Focusable from '../components/Focusable';

interface SettingsItem {
  id: string;
  label: string;
  type: 'toggle' | 'slider' | 'select';
  value: any;
  options?: Array<{ label: string; value: any }>;
  min?: number;
  max?: number;
  step?: number;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsItem[]>([
    {
      id: 'uiScale',
      label: 'UI Scale',
      type: 'slider',
      value: 1.0,
      min: 0.8,
      max: 1.5,
      step: 0.1
    },
    {
      id: 'skipIntro',
      label: 'Skip Intro',
      type: 'toggle',
      value: true
    },
    {
      id: 'autoplay',
      label: 'Autoplay Next Episode',
      type: 'toggle',
      value: true
    },
    {
      id: 'theme',
      label: 'Theme',
      type: 'select',
      value: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'High Contrast', value: 'high-contrast' }
      ]
    },
    {
      id: 'defaultLanguage',
      label: 'Default Audio Language',
      type: 'select',
      value: 'japanese',
      options: [
        { label: 'Japanese', value: 'japanese' },
        { label: 'English', value: 'english' }
      ]
    },
    {
      id: 'volumeNormalization',
      label: 'Volume Normalization',
      type: 'toggle',
      value: false
    },
    {
      id: 'surround',
      label: 'Surround Sound',
      type: 'toggle',
      value: false
    },
    {
      id: 'appLanguage',
      label: 'App Language',
      type: 'select',
      value: 'english',
      options: [
        { label: 'English', value: 'english' },
        { label: 'Japanese', value: 'japanese' },
        { label: 'Spanish', value: 'spanish' }
      ]
    },
    {
      id: 'subtitleSize',
      label: 'Subtitle Size',
      type: 'slider',
      value: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.1
    },
    {
      id: 'reducedMotion',
      label: 'Reduced Motion',
      type: 'toggle',
      value: false
    },
    {
      id: 'enhancedFocus',
      label: 'Enhanced Focus Indicators',
      type: 'toggle',
      value: false
    }
  ]);

  const updateSetting = (id: string, value: any) => {
    setSettings(prev => prev.map(setting => 
      setting.id === id ? { ...setting, value } : setting
    ));
  };

  const resetToDefaults = () => {
    // Reset all settings to default values
    setSettings(prev => prev.map(setting => ({
      ...setting,
      value: getDefaultValue(setting)
    })));
  };

  const getDefaultValue = (setting: SettingsItem) => {
    switch (setting.id) {
      case 'uiScale': return 1.0;
      case 'skipIntro': return true;
      case 'autoplay': return true;
      case 'theme': return 'default';
      case 'defaultLanguage': return 'japanese';
      case 'volumeNormalization': return false;
      case 'surround': return false;
      case 'appLanguage': return 'english';
      case 'subtitleSize': return 1.0;
      case 'reducedMotion': return false;
      case 'enhancedFocus': return false;
      default: return setting.value;
    }
  };

  const renderSettingControl = (setting: SettingsItem) => {
    switch (setting.type) {
      case 'toggle':
        return (
          <Focusable
            tag="button"
            className={`relative w-16 h-8 rounded-full transition-colors ${
              setting.value ? 'bg-tatakai-purple' : 'bg-gray-600'
            }`}
            onEnterPress={() => updateSetting(setting.id, !setting.value)}
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
                setting.value ? 'translate-x-9' : 'translate-x-1'
              }`}
            />
          </Focusable>
        );

      case 'slider':
        return (
          <div className="flex items-center space-x-4 flex-1">
            <span className="text-sm text-gray-400 w-12">{setting.min}</span>
            <div className="flex-1 relative">
              <input
                type="range"
                min={setting.min}
                max={setting.max}
                step={setting.step}
                value={setting.value}
                onChange={(e) => updateSetting(setting.id, parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
            <span className="text-sm text-gray-400 w-12">{setting.max}</span>
            <span className="text-white font-medium w-16">{setting.value.toFixed(1)}</span>
          </div>
        );

      case 'select':
        return (
          <Focusable
            tag="select"
            className="bg-tv-surface border border-tv-border rounded-lg px-4 py-2 text-white min-w-[200px]"
            value={setting.value}
            onChange={(e: any) => updateSetting(setting.id, e.target.value)}
          >
            {setting.options?.map(option => (
              <option key={option.value} value={option.value} className="bg-tv-surface">
                {option.label}
              </option>
            ))}
          </Focusable>
        );

      default:
        return null;
    }
  };

  const settingCategories = [
    {
      title: 'Display',
      settings: settings.filter(s => ['uiScale', 'theme'].includes(s.id))
    },
    {
      title: 'Playback',
      settings: settings.filter(s => ['skipIntro', 'autoplay'].includes(s.id))
    },
    {
      title: 'Audio',
      settings: settings.filter(s => ['defaultLanguage', 'volumeNormalization', 'surround'].includes(s.id))
    },
    {
      title: 'Language & Subtitles',
      settings: settings.filter(s => ['appLanguage', 'subtitleSize'].includes(s.id))
    },
    {
      title: 'Accessibility',
      settings: settings.filter(s => ['reducedMotion', 'enhancedFocus'].includes(s.id))
    }
  ];

  return (
    <div className="min-h-screen bg-tvbg text-white px-safeH py-safeV">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Customize your Tatakai experience</p>
        </div>

        {/* Settings Categories */}
        <div className="space-y-8">
          {settingCategories.map(category => (
            <div key={category.title} className="bg-tv-surface rounded-xl p-6 border border-tv-border">
              <h2 className="text-xl font-semibold text-white mb-6">{category.title}</h2>
              
              <div className="space-y-6">
                {category.settings.map(setting => (
                  <div key={setting.id} className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="text-lg text-white font-medium">
                        {setting.label}
                      </label>
                    </div>
                    <div className="flex items-center">
                      {renderSettingControl(setting)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Network Diagnostics */}
        <div className="mt-8 bg-tv-surface rounded-xl p-6 border border-tv-border">
          <h2 className="text-xl font-semibold text-white mb-6">Network</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-lg text-white">Connection Status</span>
              <span className="text-green-400 font-medium">Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg text-white">Ping</span>
              <span className="text-white font-medium">24ms</span>
            </div>
            <Focusable
              tag="button"
              className="w-full px-4 py-3 bg-tatakai-purple hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
              onEnterPress={() => console.log('Running network test...')}
            >
              Run Network Test
            </Focusable>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex space-x-4">
          <Focusable
            tag="button"
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            onEnterPress={resetToDefaults}
          >
            Reset to Defaults
          </Focusable>
          <Focusable
            tag="button"
            className="px-6 py-3 bg-tatakai-purple hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            onEnterPress={() => console.log('Settings saved')}
          >
            Save Settings
          </Focusable>
        </div>
      </div>

      {/* Custom CSS for slider */}
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8A2BE2;
          cursor: pointer;
          box-shadow: 0 0 0 4px rgba(138, 43, 226, 0.3);
        }
        
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8A2BE2;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 0 4px rgba(138, 43, 226, 0.3);
        }
      `}</style>
    </div>
  );
}