module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        tvbg: '#111212',
        'tvbg-2': '#1C1C1C',
        'tv-surface': '#2E2E2E',
        'tatakai-purple': '#8A2BE2'
      },
      spacing: {
        safeV: '4vh',
        safeH: '6vw'
      },
      boxShadow: {
        tvFocus: '0 0 0 6px rgba(138,43,226,0.4), 0 4px 20px rgba(138,43,226,0.3)'
      },
      scale: {
        'tv-focus': '1.08'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};