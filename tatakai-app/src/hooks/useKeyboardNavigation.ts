import { useEffect, useRef, useState, useCallback } from 'react';

interface KeyboardNavigationOptions {
  onSelect?: (element: HTMLElement, index: number) => void;
  onEscape?: () => void;
  isActive?: boolean;
  selector?: string;
  autoFocus?: boolean;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions = {}) {
  const {
    onSelect,
    onEscape,
    isActive = true,
    selector = '[data-keyboard-nav]',
    autoFocus = true
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusableElements, setFocusableElements] = useState<HTMLElement[]>([]);

  // Update focusable elements when container changes
  const updateFocusableElements = useCallback(() => {
    if (!containerRef.current) return;

    const elements = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(
        `${selector}:not([disabled]):not([aria-hidden="true"])`
      )
    ).filter(el => {
      // Check if element is visible
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    setFocusableElements(elements);
    
    // Reset index if current index is out of bounds
    if (elements.length > 0 && currentIndex >= elements.length) {
      setCurrentIndex(0);
    }
  }, [selector, currentIndex]);

  // Set focus to current element
  const setFocus = useCallback((index: number) => {
    if (index < 0 || index >= focusableElements.length) return;

    // Remove focus class from all elements
    focusableElements.forEach(el => {
      el.classList.remove('keyboard-focused');
      el.setAttribute('tabindex', '-1');
    });

    // Add focus class to current element
    const currentElement = focusableElements[index];
    if (currentElement) {
      currentElement.classList.add('keyboard-focused');
      currentElement.setAttribute('tabindex', '0');
      currentElement.focus();
      setCurrentIndex(index);
    }
  }, [focusableElements]);

  // Navigate up
  const navigateUp = useCallback(() => {
    if (focusableElements.length === 0) return;
    const newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
    setFocus(newIndex);
  }, [currentIndex, focusableElements.length, setFocus]);

  // Navigate down
  const navigateDown = useCallback(() => {
    if (focusableElements.length === 0) return;
    const newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
    setFocus(newIndex);
  }, [currentIndex, focusableElements.length, setFocus]);

  // Select current element
  const selectCurrent = useCallback(() => {
    const currentElement = focusableElements[currentIndex];
    if (currentElement && onSelect) {
      onSelect(currentElement, currentIndex);
    } else if (currentElement) {
      // Default behavior: click the element
      currentElement.click();
    }
  }, [focusableElements, currentIndex, onSelect]);

  // Handle keyboard events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isActive || focusableElements.length === 0) return;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        navigateUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        navigateDown();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectCurrent();
        break;
      case 'Escape':
        if (onEscape) {
          event.preventDefault();
          onEscape();
        }
        break;
    }
  }, [isActive, focusableElements.length, navigateUp, navigateDown, selectCurrent, onEscape]);

  // Initialize focus
  const initializeFocus = useCallback(() => {
    updateFocusableElements();
    if (autoFocus && focusableElements.length > 0) {
      setFocus(0);
    }
  }, [autoFocus, focusableElements.length, setFocus, updateFocusableElements]);

  // Set up event listeners
  useEffect(() => {
    if (!isActive) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, isActive]);

  // Update focusable elements when container or selector changes
  useEffect(() => {
    updateFocusableElements();
  }, [updateFocusableElements]);

  // Initialize focus when becoming active
  useEffect(() => {
    if (isActive && autoFocus && focusableElements.length > 0 && currentIndex === 0) {
      setFocus(0);
    }
  }, [isActive, autoFocus, focusableElements.length, currentIndex, setFocus]);

  return {
    containerRef,
    currentIndex,
    focusableElements,
    navigateUp,
    navigateDown,
    selectCurrent,
    setFocus,
    initializeFocus,
    updateFocusableElements
  };
}