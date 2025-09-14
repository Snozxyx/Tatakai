import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface FocusableElement {
  id: string;
  element: HTMLElement;
  parent?: string;
  children?: string[];
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
  autoScroll?: boolean;
}

interface NavigationContextType {
  registerElement: (id: string, element: HTMLElement, options?: Partial<FocusableElement>) => void;
  unregisterElement: (id: string) => void;
  focusElement: (id: string) => void;
  getCurrentFocus: () => string | null;
  moveLeft: () => void;
  moveRight: () => void;
  moveUp: () => void;
  moveDown: () => void;
  selectCurrent: () => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
};

interface NavigationProviderProps {
  children: React.ReactNode;
  initialFocus?: string;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialFocus
}) => {
  const [elements, setElements] = useState<Map<string, FocusableElement>>(new Map());
  const [currentFocus, setCurrentFocus] = useState<string | null>(null);
  const [focusHistory, setFocusHistory] = useState<string[]>([]);
  const [isNavigating, setIsNavigating] = useState(false);

  const registerElement = useCallback((
    id: string,
    element: HTMLElement,
    options: Partial<FocusableElement> = {}
  ) => {
    setElements(prev => {
      const newMap = new Map(prev);
      newMap.set(id, {
        id,
        element,
        ...options
      });
      return newMap;
    });

    // Set initial focus if this is the designated initial focus
    if (initialFocus === id && !currentFocus) {
      setTimeout(() => setCurrentFocus(id), 100);
    }
  }, [initialFocus, currentFocus]);

  const unregisterElement = useCallback((id: string) => {
    setElements(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
    
    if (currentFocus === id) {
      setCurrentFocus(null);
    }
  }, [currentFocus]);

  const focusElement = useCallback((id: string) => {
    const focusableElement = elements.get(id);
    if (!focusableElement) return;

    // First, remove focus from ALL elements to ensure clean state
    document.querySelectorAll('.tv-focused').forEach(el => {
      el.classList.remove('tv-focused');
    });

    // Blur current element using our tracked current focus
    if (currentFocus && currentFocus !== id) {
      const currentElement = elements.get(currentFocus);
      if (currentElement) {
        currentElement.onBlur?.();
      }
    }

    // Focus new element
    focusableElement.element.classList.add('tv-focused');
    focusableElement.onFocus?.();
    
    // Auto-scroll if enabled
    if (focusableElement.autoScroll !== false) {
      focusableElement.element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }

    // Update focus history
    if (currentFocus && currentFocus !== id) {
      setFocusHistory(prev => [...prev.slice(-10), currentFocus]);
    }

    setCurrentFocus(id);
  }, [elements, currentFocus]);

  const findNextElement = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    if (!currentFocus) return null;

    const currentElement = elements.get(currentFocus);
    if (!currentElement) return null;

    const currentRect = currentElement.element.getBoundingClientRect();
    const elementsArray = Array.from(elements.values()).filter(el => {
      const rect = el.element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0; // Only visible elements
    });

    const candidates: { element: FocusableElement; distance: number }[] = [];

    elementsArray.forEach(element => {
      if (element.id === currentFocus) return;
      
      const rect = element.element.getBoundingClientRect();
      let isValidDirection = false;
      let distance = 0;

      switch (direction) {
        case 'left':
          isValidDirection = rect.right <= currentRect.left + 10;
          distance = currentRect.left - rect.right + Math.abs(rect.top - currentRect.top) * 0.1;
          break;
        case 'right':
          isValidDirection = rect.left >= currentRect.right - 10;
          distance = rect.left - currentRect.right + Math.abs(rect.top - currentRect.top) * 0.1;
          break;
        case 'up':
          isValidDirection = rect.bottom <= currentRect.top + 10;
          distance = currentRect.top - rect.bottom + Math.abs(rect.left - currentRect.left) * 0.1;
          break;
        case 'down':
          isValidDirection = rect.top >= currentRect.bottom - 10;
          distance = rect.top - currentRect.bottom + Math.abs(rect.left - currentRect.left) * 0.1;
          break;
      }

      if (isValidDirection && distance >= 0) {
        candidates.push({ element, distance });
      }
    });

    // Sort by distance and return the closest
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.length > 0 ? candidates[0].element.id : null;
  }, [currentFocus, elements]);

  const moveLeft = useCallback(() => {
    if (isNavigating) return;
    setIsNavigating(true);
    const nextId = findNextElement('left');
    if (nextId) focusElement(nextId);
    setTimeout(() => setIsNavigating(false), 100);
  }, [findNextElement, focusElement, isNavigating]);

  const moveRight = useCallback(() => {
    if (isNavigating) return;
    setIsNavigating(true);
    const nextId = findNextElement('right');
    if (nextId) focusElement(nextId);
    setTimeout(() => setIsNavigating(false), 100);
  }, [findNextElement, focusElement, isNavigating]);

  const moveUp = useCallback(() => {
    if (isNavigating) return;
    setIsNavigating(true);
    const nextId = findNextElement('up');
    if (nextId) focusElement(nextId);
    setTimeout(() => setIsNavigating(false), 100);
  }, [findNextElement, focusElement, isNavigating]);

  const moveDown = useCallback(() => {
    if (isNavigating) return;
    setIsNavigating(true);
    const nextId = findNextElement('down');
    if (nextId) focusElement(nextId);
    setTimeout(() => setIsNavigating(false), 100);
  }, [findNextElement, focusElement, isNavigating]);

  const selectCurrent = useCallback(() => {
    if (!currentFocus) return;
    const element = elements.get(currentFocus);
    if (element) {
      element.onEnter?.();
    }
  }, [currentFocus, elements]);

  const goBack = useCallback(() => {
    if (focusHistory.length > 0) {
      const previousFocus = focusHistory[focusHistory.length - 1];
      setFocusHistory(prev => prev.slice(0, -1));
      if (elements.has(previousFocus)) {
        focusElement(previousFocus);
      }
    }
  }, [focusHistory, elements, focusElement]);

  const getCurrentFocus = useCallback(() => currentFocus, [currentFocus]);

  // Handle initial focus
  useEffect(() => {
    if (initialFocus && elements.has(initialFocus) && !currentFocus) {
      setTimeout(() => focusElement(initialFocus), 100);
    }
  }, [initialFocus, elements, currentFocus, focusElement]);

  // Enhanced keyboard and TV remote event handling
  useEffect(() => {
    const handleKeyEvents = (event: KeyboardEvent) => {
      // Skip if focus is in an input field
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      // Get both key name and key code for comprehensive handling
      const { key, keyCode, code } = event;
      
      // Navigation keys that should prevent default behavior
      const navigationKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Backspace'];
      const navigationKeyCodes = [37, 38, 39, 40, 13, 32, 27, 8, 415, 19, 413, 417, 418, 419, 420];
      
      // Prevent default for navigation keys
      if (navigationKeys.includes(key) || navigationKeyCodes.includes(keyCode)) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Handle standard keyboard events (works for regular keyboards)
      switch (key) {
        case 'ArrowLeft':
          moveLeft();
          return;
        case 'ArrowRight':
          moveRight();
          return;
        case 'ArrowUp':
          moveUp();
          return;
        case 'ArrowDown':
          moveDown();
          return;
        case 'Enter':
        case ' ':
          selectCurrent();
          return;
        case 'Escape':
        case 'Backspace':
          goBack();
          return;
      }

      // Handle TV remote control key codes (works for WebOS and other TV platforms)
      switch (keyCode) {
        case 37: // Left Arrow
          moveLeft();
          break;
        case 39: // Right Arrow
          moveRight();
          break;
        case 38: // Up Arrow
          moveUp();
          break;
        case 40: // Down Arrow
          moveDown();
          break;
        case 13: // OK/Enter
        case 32: // Space (some remotes)
          selectCurrent();
          break;
        case 8: // Back/Backspace
        case 27: // Menu/Exit/Escape
          goBack();
          break;
        // WebOS specific media keys
        case 415: // Play
        case 417: // Fast Forward
        case 412: // Rewind
        case 19: // Pause
        case 413: // Stop
        case 418: // Previous
        case 419: // Next
          // Media keys - can be handled by individual components
          break;
        // Color button keys (if needed)
        case 403: // Red
        case 404: // Green  
        case 405: // Yellow
        case 406: // Blue
          // Color buttons - can be handled by individual components
          break;
      }

      // Handle special codes that might be used by different TV platforms
      switch (code) {
        case 'BrowserBack':
        case 'GoBack':
          event.preventDefault();
          goBack();
          break;
      }
    };

    // Always add the unified event handler
    document.addEventListener('keydown', handleKeyEvents, true);

    return () => {
      document.removeEventListener('keydown', handleKeyEvents, true);
    };
  }, [moveLeft, moveRight, moveUp, moveDown, selectCurrent, goBack]);

  const value: NavigationContextType = {
    registerElement,
    unregisterElement,
    focusElement,
    getCurrentFocus,
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    selectCurrent,
    goBack
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};