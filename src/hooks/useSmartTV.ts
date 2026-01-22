import { useState, useEffect, useCallback, useRef } from 'react';

interface SmartTVInfo {
  isSmartTV: boolean;
  platform: 'webos' | 'tizen' | 'android_tv' | 'fire_tv' | 'roku' | 'xbox' | 'playstation' | 'generic' | 'desktop';
  supportsRemote: boolean;
  focusedElement: HTMLElement | null;
}

interface DPadNavigationOptions {
  onEnter?: () => void;
  onBack?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
}

/**
 * Enhanced Smart TV detection and D-pad navigation
 */
export function useSmartTV(): SmartTVInfo {
  const [tvInfo, setTvInfo] = useState<SmartTVInfo>({
    isSmartTV: false,
    platform: 'desktop',
    supportsRemote: false,
    focusedElement: null,
  });

  const focusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';
    
    let detected: SmartTVInfo = {
      isSmartTV: false,
      platform: 'desktop',
      supportsRemote: false,
    };

    // LG WebOS
    if (userAgent.includes('webos') || userAgent.includes('web0s') || userAgent.includes('netcast')) {
      detected = { isSmartTV: true, platform: 'webos', supportsRemote: true };
    }
    // Samsung Tizen
    else if (userAgent.includes('tizen') || userAgent.includes('samsung')) {
      detected = { isSmartTV: true, platform: 'tizen', supportsRemote: true };
    }
    // Android TV
    else if ((userAgent.includes('android') && userAgent.includes('tv')) || 
             userAgent.includes('android tv') || 
             userAgent.includes('googletv') ||
             userAgent.includes('aft')) { // Amazon Fire TV
      if (userAgent.includes('aft')) {
        detected = { isSmartTV: true, platform: 'fire_tv', supportsRemote: true };
      } else {
        detected = { isSmartTV: true, platform: 'android_tv', supportsRemote: true };
      }
    }
    // Roku
    else if (userAgent.includes('roku')) {
      detected = { isSmartTV: true, platform: 'roku', supportsRemote: true };
    }
    // Xbox
    else if (userAgent.includes('xbox') || platform.includes('xbox')) {
      detected = { isSmartTV: true, platform: 'xbox', supportsRemote: true };
    }
    // PlayStation
    else if (userAgent.includes('playstation') || userAgent.includes('ps4') || userAgent.includes('ps5')) {
      detected = { isSmartTV: true, platform: 'playstation', supportsRemote: true };
    }
    // Generic Smart TV indicators
    else if (
      userAgent.includes('smart-tv') ||
      userAgent.includes('smarttv') ||
      userAgent.includes('googletv') ||
      userAgent.includes('hbbtv') ||
      userAgent.includes('crkey') || // Chromecast
      userAgent.includes('opera tv') ||
      userAgent.includes('netrange') ||
      userAgent.includes('viera') || // Panasonic
      userAgent.includes('nettv') || // Philips
      userAgent.includes('tv browser') ||
      // Check for TV-like screen without touch
      (window.innerWidth >= 1280 && !('ontouchstart' in window) && 
       (userAgent.includes('tv') || userAgent.includes('large screen')))
    ) {
      detected = { isSmartTV: true, platform: 'generic', supportsRemote: true };
    }

    setTvInfo(detected);

    // Add body class for CSS targeting
    if (detected.isSmartTV) {
      document.body.classList.add('smart-tv-mode', `platform-${detected.platform}`);
    }

    return () => {
      document.body.classList.remove('smart-tv-mode', `platform-${detected.platform}`);
    };
  }, []);

  // D-pad navigation handler
  useEffect(() => {
    if (!tvInfo.supportsRemote) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ].join(', ');

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveFocus('up', focusableSelectors);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveFocus('down', focusableSelectors);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus('left', focusableSelectors);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveFocus('right', focusableSelectors);
          break;
        case 'Enter':
        case ' ': // Space bar
          e.preventDefault();
          const active = document.activeElement as HTMLElement;
          if (active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.getAttribute('role') === 'button')) {
            active.click();
          }
          break;
        case 'Backspace':
        case 'Escape':
          // Handle back navigation
          if (window.history.length > 1) {
            window.history.back();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tvInfo.supportsRemote]);

  return tvInfo;
}

/**
 * Move focus in a direction
 */
function moveFocus(direction: 'up' | 'down' | 'left' | 'right', selectors: string) {
  const focusable = Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(
    (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    }
  );

  if (focusable.length === 0) return;

  const current = document.activeElement as HTMLElement;
  const currentIndex = focusable.indexOf(current);
  const currentRect = current?.getBoundingClientRect();

  if (!currentRect && focusable.length > 0) {
    focusable[0].focus();
    return;
  }

  let nextIndex = -1;
  let minDistance = Infinity;

  focusable.forEach((el, index) => {
    if (index === currentIndex) return;

    const rect = el.getBoundingClientRect();
    let distance = Infinity;
    let isInDirection = false;

    switch (direction) {
      case 'up':
        isInDirection = rect.top < currentRect.top;
        distance = Math.abs(rect.left - currentRect.left) + (currentRect.top - rect.top);
        break;
      case 'down':
        isInDirection = rect.top > currentRect.bottom;
        distance = Math.abs(rect.left - currentRect.left) + (rect.top - currentRect.bottom);
        break;
      case 'left':
        isInDirection = rect.left < currentRect.left;
        distance = Math.abs(rect.top - currentRect.top) + (currentRect.left - rect.left);
        break;
      case 'right':
        isInDirection = rect.right > currentRect.right;
        distance = Math.abs(rect.top - currentRect.top) + (rect.right - currentRect.right);
        break;
    }

    if (isInDirection && distance < minDistance) {
      minDistance = distance;
      nextIndex = index;
    }
  });

  if (nextIndex >= 0) {
    focusable[nextIndex].focus();
  } else {
    // Wrap around
    if (direction === 'up' || direction === 'left') {
      focusable[focusable.length - 1].focus();
    } else {
      focusable[0].focus();
    }
  }
}

/**
 * Hook for D-pad navigation with custom handlers
 */
export function useDPadNavigation(options: DPadNavigationOptions = {}) {
  const { isSmartTV, supportsRemote } = useSmartTV();

  useEffect(() => {
    if (!supportsRemote) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          options.onUp?.();
          break;
        case 'ArrowDown':
          e.preventDefault();
          options.onDown?.();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          options.onLeft?.();
          break;
        case 'ArrowRight':
          e.preventDefault();
          options.onRight?.();
          break;
        case 'Enter':
          e.preventDefault();
          options.onEnter?.();
          break;
        case 'Backspace':
        case 'Escape':
          e.preventDefault();
          options.onBack?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [supportsRemote, options]);

  return { isSmartTV, supportsRemote };
}
