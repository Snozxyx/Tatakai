// Note: Since norigin-spatial-navigation might not be available in all environments,
// we'll create a simplified spatial navigation system for now
// that can be easily swapped out with the real norigin when available

interface SpatialNavigationConfig {
  selector: string;
  straightOnly?: boolean;
  rememberSource?: boolean;
}

interface NavigationSection {
  id: string;
  selector: string;
  defaultElement?: string;
}

class SimpleSpatialNavigation {
  private focusableElements: HTMLElement[] = [];
  private currentFocusIndex = 0;
  private config: SpatialNavigationConfig;

  constructor() {
    this.config = {
      selector: '.focusable',
      straightOnly: true,
      rememberSource: true
    };
  }

  init(config?: Partial<SpatialNavigationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.bindEvents();
    this.updateFocusableElements();
    this.setInitialFocus();

    console.log('Spatial navigation initialized');
    return this;
  }

  add(_section: NavigationSection) {
    // For simple implementation, we'll just update focusable elements
    this.updateFocusableElements();
  }

  private bindEvents() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Handle dynamic content changes
    const observer = new MutationObserver(() => {
      this.updateFocusableElements();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled', 'hidden']
    });
  }

  private handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.moveUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveDown();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.moveLeft();
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.moveRight();
        break;
      case 'Enter':
        event.preventDefault();
        this.selectCurrent();
        break;
    }
  }

  private updateFocusableElements() {
    this.focusableElements = Array.from(
      document.querySelectorAll(this.config.selector + ':not([disabled]):not(.hidden)')
    ) as HTMLElement[];
  }

  private setInitialFocus() {
    if (this.focusableElements.length > 0) {
      this.currentFocusIndex = 0;
      this.setFocus(0);
    }
  }

  private setFocus(index: number) {
    if (index < 0 || index >= this.focusableElements.length) return;

    // Remove focus from all elements
    this.focusableElements.forEach(el => {
      el.classList.remove('focused');
      el.blur();
    });

    // Set focus to current element
    this.currentFocusIndex = index;
    const currentElement = this.focusableElements[index];
    if (currentElement) {
      currentElement.classList.add('focused');
      currentElement.focus();
      this.scrollIntoView(currentElement);
    }
  }

  private scrollIntoView(element: HTMLElement) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }

  private moveUp() {
    // Simple grid navigation - find element above current one
    const currentElement = this.focusableElements[this.currentFocusIndex];
    if (!currentElement) return;

    const currentRect = currentElement.getBoundingClientRect();
    let bestMatch = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.focusableElements.length; i++) {
      if (i === this.currentFocusIndex) continue;

      const rect = this.focusableElements[i].getBoundingClientRect();
      if (rect.bottom <= currentRect.top) {
        const distance = Math.abs(rect.left - currentRect.left) + (currentRect.top - rect.bottom);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        }
      }
    }

    if (bestMatch >= 0) {
      this.setFocus(bestMatch);
    }
  }

  private moveDown() {
    const currentElement = this.focusableElements[this.currentFocusIndex];
    if (!currentElement) return;

    const currentRect = currentElement.getBoundingClientRect();
    let bestMatch = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.focusableElements.length; i++) {
      if (i === this.currentFocusIndex) continue;

      const rect = this.focusableElements[i].getBoundingClientRect();
      if (rect.top >= currentRect.bottom) {
        const distance = Math.abs(rect.left - currentRect.left) + (rect.top - currentRect.bottom);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        }
      }
    }

    if (bestMatch >= 0) {
      this.setFocus(bestMatch);
    }
  }

  private moveLeft() {
    const currentElement = this.focusableElements[this.currentFocusIndex];
    if (!currentElement) return;

    const currentRect = currentElement.getBoundingClientRect();
    let bestMatch = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.focusableElements.length; i++) {
      if (i === this.currentFocusIndex) continue;

      const rect = this.focusableElements[i].getBoundingClientRect();
      if (rect.right <= currentRect.left) {
        const distance = Math.abs(rect.top - currentRect.top) + (currentRect.left - rect.right);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        }
      }
    }

    if (bestMatch >= 0) {
      this.setFocus(bestMatch);
    }
  }

  private moveRight() {
    const currentElement = this.focusableElements[this.currentFocusIndex];
    if (!currentElement) return;

    const currentRect = currentElement.getBoundingClientRect();
    let bestMatch = -1;
    let bestDistance = Infinity;

    for (let i = 0; i < this.focusableElements.length; i++) {
      if (i === this.currentFocusIndex) continue;

      const rect = this.focusableElements[i].getBoundingClientRect();
      if (rect.left >= currentRect.right) {
        const distance = Math.abs(rect.top - currentRect.top) + (rect.left - currentRect.right);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = i;
        }
      }
    }

    if (bestMatch >= 0) {
      this.setFocus(bestMatch);
    }
  }

  private selectCurrent() {
    const currentElement = this.focusableElements[this.currentFocusIndex];
    if (currentElement) {
      currentElement.click();
    }
  }

  refresh() {
    this.updateFocusableElements();
    if (this.focusableElements.length > 0) {
      if (this.currentFocusIndex >= this.focusableElements.length) {
        this.currentFocusIndex = 0;
      }
      this.setFocus(this.currentFocusIndex);
    }
  }
}

// Create singleton instance
const SpatialNavigation = new SimpleSpatialNavigation();

export function setupSpatial() {
  return SpatialNavigation.init({
    selector: '.focusable',
    straightOnly: true,
    rememberSource: true
  });
}

export default SpatialNavigation;