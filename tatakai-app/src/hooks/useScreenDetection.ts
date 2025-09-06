'use client';

import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'mobile' | 'laptop' | 'tv';

interface ScreenDetection {
  deviceType: DeviceType;
  screenWidth: number;
  screenHeight: number;
  isUserSelected: boolean;
  setDeviceType: (type: DeviceType) => void;
  resetToAutoDetect: () => void;
}

const STORAGE_KEY = 'tatakai-device-preference';

// Device breakpoints
const BREAKPOINTS = {
  mobile: 768,
  laptop: 1536,
  // TV is anything above laptop breakpoint
} as const;

// Auto-detect device type based on screen dimensions
function autoDetectDevice(width: number, height: number): DeviceType {
  // TV detection: Large screens (>= 1536px width) or very wide aspect ratios
  if (width >= BREAKPOINTS.laptop) {
    return 'tv';
  }
  
  // Mobile detection: Small screens (< 768px width)
  if (width < BREAKPOINTS.mobile) {
    return 'mobile';
  }
  
  // Laptop: Everything in between
  return 'laptop';
}

export function useScreenDetection(): ScreenDetection {
  const [screenWidth, setScreenWidth] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const [deviceType, setDeviceTypeState] = useState<DeviceType>('laptop');
  const [isUserSelected, setIsUserSelected] = useState(false);

  // Load saved preference and detect screen size
  const updateScreenInfo = useCallback(() => {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    
    setScreenWidth(width);
    setScreenHeight(height);

    // Try to load user preference from localStorage
    try {
      const savedPreference = localStorage.getItem(STORAGE_KEY);
      if (savedPreference) {
        const parsed = JSON.parse(savedPreference);
        if (parsed.deviceType && ['mobile', 'laptop', 'tv'].includes(parsed.deviceType)) {
          setDeviceTypeState(parsed.deviceType);
          setIsUserSelected(true);
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to load device preference:', error);
    }

    // Auto-detect if no user preference
    const detected = autoDetectDevice(width, height);
    setDeviceTypeState(detected);
    setIsUserSelected(false);
  }, []);

  // Set device type (user override)
  const setDeviceType = useCallback((type: DeviceType) => {
    setDeviceTypeState(type);
    setIsUserSelected(true);
    
    // Save to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        deviceType: type,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to save device preference:', error);
    }
  }, []);

  // Reset to auto-detection
  const resetToAutoDetect = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear device preference:', error);
    }
    
    const detected = autoDetectDevice(screenWidth, screenHeight);
    setDeviceTypeState(detected);
    setIsUserSelected(false);
  }, [screenWidth, screenHeight]);

  // Handle window resize
  useEffect(() => {
    updateScreenInfo();
    
    const handleResize = () => {
      updateScreenInfo();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateScreenInfo]);

  return {
    deviceType,
    screenWidth,
    screenHeight,
    isUserSelected,
    setDeviceType,
    resetToAutoDetect
  };
}