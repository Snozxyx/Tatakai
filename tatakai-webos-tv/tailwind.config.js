/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Design tokens from 1design.json
      colors: {
        // Improved dark theme - not pure black
        background: {
          DEFAULT: '#0F0F0F', // Dark gray instead of pure black
          light: '#1A1A1A',
          lighter: '#242424'
        },
        surface: {
          DEFAULT: '#1A1A1A',
          elevated: '#242424',
          hover: '#2E2E2E'
        },
        foreground: '#FFFFFF',
        text: {
          primary: '#FFFFFF',
          secondary: '#CCCCCC', // Higher contrast
          muted: '#999999',
          disabled: '#666666'
        },
        accent: {
          DEFAULT: '#8A2BE2',
          hover: '#7B2BCB',
          light: '#9A3BF2',
          dark: '#6A1FAB'
        },
        card: {
          DEFAULT: '#1A1A1A',
          active: '#8A2BE2',
          hover: '#2A2A2A',
          focused: '#2E2E2E'
        },
        icon: {
          DEFAULT: '#CCCCCC', // Better contrast
          active: '#8A2BE2',
          muted: '#999999'
        },
        border: {
          DEFAULT: '#333333',
          active: '#8A2BE2',
          light: '#444444'
        },
        focus: {
          ring: '#8A2BE2',
          glow: 'rgba(138, 43, 226, 0.4)'
        },
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
        '4xl': '96px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      fontSize: {
        // TV-optimized typography for 10-foot viewing
        'tv-xs': '16px',
        'tv-sm': '18px',
        'tv-base': '20px', 
        'tv-lg': '24px',
        'tv-xl': '28px',
        'tv-2xl': '32px',
        'tv-3xl': '40px',
        'tv-4xl': '48px',
        'tv-5xl': '56px'
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
      },
      lineHeight: {
        tight: '1.2',
        normal: '1.5',
        relaxed: '1.75'
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        'full': '9999px'
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'md': '0 4px 12px rgba(0, 0, 0, 0.6)',
        'lg': '0 8px 24px rgba(0, 0, 0, 0.8)',
        'xl': '0 12px 32px rgba(0, 0, 0, 0.9)'
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '300ms',
        'slow': '500ms'
      },
      transitionTimingFunction: {
        'ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)'
      },
      screens: {
        'tv-720': '1280px',
        'tv-1080': '1920px'
      },
      // TV-specific utilities
      animation: {
        'focus-ring': 'focus-ring 0.3s ease',
        'card-hover': 'card-hover 0.3s ease',
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'shimmer': 'shimmer 1.5s infinite'
      },
      keyframes: {
        'focus-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(1.05)', opacity: '1' }
        },
        'card-hover': {
          '0%': { transform: 'scale(1) translateY(0)' },
          '100%': { transform: 'scale(1.05) translateY(-4px)' }
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' }
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        'shimmer': {
          '0%': { 'background-position': '-200% 0' },
          '100%': { 'background-position': '200% 0' }
        }
      },
      // TV-optimized aspect ratios
      aspectRatio: {
        'poster': '2/3',
        'banner': '16/9',
        'square': '1/1'
      }
    },
  },
  plugins: [
    // Custom TV focus plugin
    function({ addUtilities }) {
      addUtilities({
        '.focusable': {
          'outline': 'none',
          'transition': 'all 0.3s ease',
          'border-radius': '8px',
          '&:focus': {
            'outline': '3px solid #8A2BE2', // Stronger focus ring
            'outline-offset': '3px',
            'box-shadow': '0 0 0 6px rgba(138, 43, 226, 0.4), 0 4px 20px rgba(138, 43, 226, 0.3)',
            'transform': 'scale(1.08)', // More noticeable scale
            'background-color': '#2E2E2E' // Subtle background change
          },
          '&:focus-visible': {
            'outline': '3px solid #8A2BE2',
            'outline-offset': '3px',
            'box-shadow': '0 0 0 6px rgba(138, 43, 226, 0.4), 0 4px 20px rgba(138, 43, 226, 0.3)'
          }
        },
        '.focusable-card': {
          'outline': 'none',
          'transition': 'all 0.3s ease',
          'border-radius': '12px',
          'border': '2px solid transparent',
          '&:focus': {
            'border-color': '#8A2BE2',
            'box-shadow': '0 0 0 4px rgba(138, 43, 226, 0.4), 0 8px 32px rgba(138, 43, 226, 0.2)',
            'transform': 'scale(1.05) translateY(-4px)',
            'z-index': 10
          }
        },
        '.tv-safe': {
          'padding': '4% 6%' // Increased safe area
        },
        '.tv-grid': {
          'gap': '24px' // Better spacing for TV
        },
        '.skeleton': {
          'background': 'linear-gradient(90deg, #1A1A1A 25%, #242424 50%, #1A1A1A 75%)',
          'background-size': '200% 100%',
          'animation': 'shimmer 1.5s infinite'
        },
        '.no-focus-outline': {
          'outline': 'none !important'
        }
      })
    }
  ],
}