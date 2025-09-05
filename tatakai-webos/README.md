# Tatakai webOS 

A modern, TV-optimized anime streaming application built with React, TypeScript, and TailwindCSS. Designed specifically for webOS smart TVs with spatial navigation and remote control support.

## Features

- **10-foot UI**: Optimized for TV viewing distances with large touch targets and readable typography
- **Spatial Navigation**: Full remote control support with intuitive directional navigation
- **HLS Video Playback**: High-quality streaming with adaptive bitrate and subtitle support
- **TV-Safe Design**: Proper color contrast, safe areas, and accessibility features
- **Focus Management**: Visual focus indicators and smooth navigation flow
- **Responsive Layout**: Adapts to different TV screen sizes and resolutions
- **Modern UI**: Beautiful animations and transitions with reduced motion support

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **TailwindCSS** for TV-optimized styling
- **Framer Motion** for animations
- **HLS.js** for video streaming
- **Zustand** for state management
- **Custom Spatial Navigation** system

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## TV Remote Controls

The app supports standard TV remote controls:

- **Arrow Keys**: Navigate between focusable elements
- **Enter/OK**: Select focused element
- **Escape/Back**: Go back or close overlays
- **Space**: Play/pause video
- **Left/Right**: Seek video (when playing)
- **Up/Down**: Volume control (when playing)

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Focusable.tsx   # Base focusable component
│   ├── AnimeCard.tsx   # Anime poster card
│   ├── SkeletonCard.tsx # Loading skeleton
│   ├── OverlaySidebar.tsx # Navigation sidebar
│   ├── TVHeader.tsx    # Top navigation bar
│   └── HlsPlayer.tsx   # Video player component
├── routes/             # Page components
│   ├── Home.tsx        # Main dashboard
│   ├── Player.tsx      # Video player page
│   └── Settings.tsx    # Settings page
├── lib/                # Utilities and libraries
│   └── spatial.ts      # Spatial navigation system
├── stores/             # State management
│   └── uiStore.ts      # UI state with Zustand
├── styles/             # Additional CSS
│   └── tv-utils.css    # TV-specific utilities
├── App.tsx             # Main app component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

## TV Optimization Features

### Focus Management
- Clear visual focus indicators with purple outlines
- Automatic scrolling to keep focused elements visible
- Focus memory for returning to previous states

### Performance
- Optimized for TV hardware with efficient rendering
- Lazy loading and code splitting for faster startup
- Background resource cleanup

### Accessibility
- High contrast design with WCAG-compliant colors
- Large clickable areas (minimum 44px)
- Reduced motion support
- Enhanced focus indicators option

## webOS Packaging

The app includes webOS-specific configuration:

- `public/appinfo.json` - webOS app manifest
- TV-safe areas and overscan handling
- Platform detection and graceful fallbacks

To package for webOS:

```bash
# Build the app
npm run build

# Package with webOS CLI tools (install separately)
ares-package dist/
```

## Color Palette

- **Primary Background**: #111111 (TV-safe dark)
- **Secondary Surface**: #1C1C1C
- **Interactive Surface**: #2E2E2E
- **Accent Color**: #8A2BE2 (Tatakai Purple)
- **Text Primary**: #FFFFFF
- **Text Secondary**: #C7C7C7
- **Text Disabled**: #808080

## Browser Compatibility

- Chrome/Chromium-based browsers
- Safari (with native HLS support)
- webOS browser
- LG Smart TV WebKit

## Contributing

1. Follow the TV-first design principles
2. Ensure all interactive elements are focusable
3. Test with keyboard navigation
4. Maintain TV-safe color contrast ratios
5. Consider 10-foot viewing distances

## License

MIT License - see LICENSE file for details