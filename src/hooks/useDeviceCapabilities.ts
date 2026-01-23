import { useState, useEffect } from 'react';

interface DeviceCapabilities {
  isLowEndDevice: boolean;
  supportsWebGL: boolean;
  supportsBackdropFilter: boolean;
  maxAnimationFPS: number;
  recommendedTheme: 'lite-mode' | 'default';
  memoryInfo?: {
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export function useDeviceCapabilities(): DeviceCapabilities {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>({
    isLowEndDevice: false,
    supportsWebGL: false,
    supportsBackdropFilter: false,
    maxAnimationFPS: 60,
    recommendedTheme: 'default',
  });

  useEffect(() => {
    const detectCapabilities = () => {
      // Check WebGL support
      const supportsWebGL = (() => {
        try {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch {
          return false;
        }
      })();

      // Check backdrop-filter support
      const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(1px)') || 
                                   CSS.supports('-webkit-backdrop-filter', 'blur(1px)');

      // Get device memory (if available)
      const deviceMemory = (navigator as any).deviceMemory;
      
      // Get hardware concurrency (CPU cores)
      const hardwareConcurrency = navigator.hardwareConcurrency;
      
      // Check for low-end device indicators
      const isLowEndDevice = 
        (deviceMemory && deviceMemory < 4) || // Less than 4GB RAM
        (hardwareConcurrency && hardwareConcurrency < 4) || // Less than 4 CPU cores
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && // Mobile device
        (deviceMemory && deviceMemory < 6) || // Mobile with less than 6GB
        window.innerWidth < 768; // Small screen

      // Calculate recommended max FPS based on device capabilities
      let maxAnimationFPS = 60;
      if (isLowEndDevice) {
        maxAnimationFPS = 30;
      } else if (deviceMemory && deviceMemory >= 8) {
        maxAnimationFPS = 60;
      }

      // Determine recommended theme
      const recommendedTheme = isLowEndDevice ? 'lite-mode' : 'default';

      // Get memory info if available
      const memoryInfo = (performance as any).memory ? {
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
      } : undefined;

      setCapabilities({
        isLowEndDevice,
        supportsWebGL,
        supportsBackdropFilter,
        maxAnimationFPS,
        recommendedTheme,
        memoryInfo,
        deviceMemory,
        hardwareConcurrency,
      });
    };

    detectCapabilities();

    // Re-check on resize for responsive behavior
    window.addEventListener('resize', detectCapabilities);
    return () => window.removeEventListener('resize', detectCapabilities);
  }, []);

  return capabilities;
}