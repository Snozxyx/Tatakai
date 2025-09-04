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
        background: '#000000',
        foreground: '#FFFFFF',
        text: {
          primary: '#FFFFFF',
          secondary: '#B0B0B0',
          muted: '#808080'
        },
        accent: {
          DEFAULT: '#8A2BE2',
          hover: '#7B2BCB',
          light: '#9A3BF2'
        },
        card: {
          DEFAULT: '#1A1A1A',
          active: '#8A2BE2',
          hover: '#2A2A2A'
        },
        icon: {
          DEFAULT: '#B0B0B0',
          active: '#8A2BE2'
        },
        border: {
          DEFAULT: '#333333',
          active: '#8A2BE2'
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
        'tv-sm': '18px',
        'tv-base': '20px', 
        'tv-lg': '24px',
        'tv-xl': '28px',
        'tv-2xl': '32px',
        'tv-3xl': '40px',
        'tv-4xl': '48px'
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
        'slide-up': 'slide-up 0.3s ease-out'
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
          '&:focus': {
            'outline': '2px solid #8A2BE2',
            'outline-offset': '2px',
            'box-shadow': '0 0 0 4px rgba(138, 43, 226, 0.3)',
            'transform': 'scale(1.05)'
          }
        },
        '.tv-safe': {
          'padding': '3% 5%'
        },
        '.no-focus-outline': {
          'outline': 'none !important'
        }
      })
    }
  ],
}