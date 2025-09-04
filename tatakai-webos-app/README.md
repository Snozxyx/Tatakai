# Tatakai webOS TV App

A modern, comprehensive anime streaming application built specifically for LG webOS smart TVs. Features a TV-optimized interface with remote control navigation, spatial awareness, and integration with the Tatakai backend for user authentication, watch history, and favorites.

## 🚀 Features

### Core Functionality
- **TV-Optimized Interface**: Designed for 10-foot viewing with large, accessible UI elements
- **Remote Control Navigation**: Full support for LG TV remote with arrow keys, OK, Back, and media buttons
- **Anime Streaming**: Access to thousands of anime titles via HiAnime API integration
- **Spotlight Carousel**: Auto-rotating featured anime with smooth transitions
- **Content Rails**: Multiple categorized content sections (Trending, Popular, Latest, etc.)
- **Responsive Design**: Optimized for 1920x1080 and 1280x720 TV resolutions

### Technology Stack
- **Frontend**: Next.js 14 + React 18 + TypeScript
- **Styling**: Tailwind CSS with custom design tokens
- **Animations**: Framer Motion for smooth TV-optimized transitions
- **Icons**: Lucide React for consistent iconography
- **UI Components**: Custom TV-focused component library
- **Navigation**: Built-in keyboard/remote focus management (Spatial Navigation ready)

### Backend Integration
- **Authentication**: JWT-based user authentication via Tatakai backend
- **Watch History**: Progress tracking across episodes and anime
- **Favorites**: Personal anime collection with ratings and notes
- **API Integration**: HiAnime API for anime data, AniSkip for intro/outro detection
- **Video Streaming**: HLS video player with quality selection and subtitle support

### webOS Integration
- **Platform APIs**: webOSTV.js integration for TV-native features
- **App Lifecycle**: Proper pause/resume and memory management
- **Remote Controls**: Media keys (Play, Pause, Stop, FF, Rewind) support
- **TV Services**: Device info, platform back navigation
- **Performance**: Optimized for TV hardware limitations

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- LG webOS TV SDK (for packaging and deployment)
- Git

### Development Setup

1. **Clone and navigate to the webOS app:**
   ```bash
   cd tatakai-webos-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Configuration:**
   Create `.env.local` file:
   ```env
   NEXT_PUBLIC_TATAKAI_API_BASE=http://localhost:5000
   # Add other environment variables as needed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`

5. **Build for production:**
   ```bash
   npm run build
   ```

### webOS TV Deployment

1. **Install webOS CLI tools:**
   ```bash
   npm install -g @webosose/ares-cli
   ```

2. **Export static build:**
   ```bash
   npm run export
   ```

3. **Package for webOS:**
   ```bash
   npm run webos-package
   ```

4. **Install on TV/Emulator:**
   ```bash
   npm run webos-install
   ```

5. **Launch app:**
   ```bash
   npm run webos-launch
   ```

## 🏗️ Project Structure

```
tatakai-webos-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── globals.css         # Global styles with design tokens
│   │   ├── layout.tsx          # Root layout with providers
│   │   └── page.tsx            # Home page entry point
│   ├── components/             # React components
│   │   ├── layout/             # Layout components
│   │   │   ├── tv-layout.tsx   # Main TV app layout
│   │   │   └── side-navigation.tsx # TV navigation sidebar
│   │   ├── pages/              # Page-level components
│   │   │   └── home-page.tsx   # Home page with carousel and rails
│   │   ├── providers/          # React context providers
│   │   │   └── spatial-navigation-provider.tsx # TV navigation setup
│   │   └── ui/                 # Reusable UI components
│   │       ├── button.tsx      # Button component with variants
│   │       └── card.tsx        # Card component for content
│   ├── lib/                    # Utility libraries
│   │   ├── api.ts              # API client for backend/HiAnime
│   │   └── utils.ts            # Utility functions and helpers
│   └── types/                  # TypeScript type definitions
├── appinfo.json                # webOS app configuration
├── next.config.js              # Next.js configuration for static export
├── package.json                # Dependencies and scripts
└── tailwind.config.js          # Tailwind CSS configuration
```

## 🎨 Design System

The app uses a custom design system optimized for TV viewing, defined in `1design.json`:

### Color Scheme
- **Background**: Pure black (`#000000`) for TV displays
- **Text**: White (`#FFFFFF`) and muted gray (`#B0B0B0`)
- **Accent**: Purple (`#8A2BE2`) for focus states and branding
- **Cards**: Dark gray (`#1A1A1A`) with subtle borders

### Typography
- **Font Family**: Inter, system-ui, sans-serif
- **Sizes**: Optimized for 10-foot viewing (larger than web standards)
- **Weights**: Normal (400), Medium (500), Semibold (600), Bold (700)

### Spacing & Layout
- **Grid System**: Responsive poster grids with proper aspect ratios
- **Focus Management**: 2px purple ring with proper offset for TV navigation
- **Side Navigation**: 60px collapsed width for minimal screen usage

## 🎮 Remote Control Support

### Navigation Keys
- **Arrow Keys**: Directional navigation through UI elements
- **OK/Enter**: Select focused element
- **Back**: Navigate back or exit app (uses webOS platformBack)
- **Home**: Return to home screen

### Media Keys
- **Play/Pause**: Control video playback
- **Stop**: Stop video and return to content
- **Fast Forward/Rewind**: Seek video content
- **Red Button**: Quick access to search
- **Blue Button**: Access categories/menu

### Keyboard Shortcuts (Development)
All remote control functions work with keyboard for development:
- Arrow keys for navigation
- Enter for selection
- Backspace for back navigation
- Space for play/pause

## 🔧 API Integration

### Tatakai Backend
- **Authentication**: `/api/auth/login`, `/api/auth/register`, `/api/auth/me`
- **Watch History**: `/api/watch-history/*` endpoints for progress tracking
- **Favorites**: `/api/favorites/*` endpoints for personal collections
- **User Management**: Profile updates, password changes, preferences

### HiAnime API
- **Home Data**: Spotlight, trending, popular, latest anime
- **Search**: Anime search with filters and suggestions
- **Anime Info**: Detailed information, episodes, characters
- **Streaming**: Episode servers, sources, and subtitle support
- **Categories**: Genre and category-based browsing

### AniSkip Integration
- **Skip Times**: Automatic intro/outro detection and skipping
- **Episode Analysis**: ML-powered content analysis for better UX

## 📱 Responsive Design

### TV Resolutions
- **1920x1080**: Full HD primary target
- **1280x720**: HD fallback with adjusted layouts
- **Container**: Max-width with centered content and proper padding

### Grid Layouts
- **Posters**: Responsive grid from 2 to 8 columns based on screen size
- **Aspect Ratios**: 2:3 for posters, 16:9 for banners
- **Gap System**: Consistent 8px, 16px, 24px spacing scale

## 🎯 Performance Optimizations

### TV-Specific Optimizations
- **Memory Management**: Efficient DOM rendering and cleanup
- **Image Loading**: Lazy loading with proper fallbacks
- **Animation Performance**: Hardware-accelerated CSS transforms
- **Bundle Size**: Optimized build with code splitting

### Loading States
- **Progressive Loading**: Skeleton screens and smooth transitions
- **Error Boundaries**: Graceful error handling with retry options
- **Network Resilience**: Offline detection and retry mechanisms

## 🧪 Testing & Quality Assurance

### Development Testing
1. **Browser Testing**: Use Chrome DevTools with TV resolution simulation
2. **Keyboard Navigation**: Test all interactions with keyboard arrows + Enter
3. **Focus Management**: Verify focus rings and logical tab order
4. **Performance**: Monitor memory usage and animation smoothness

### webOS Testing
1. **Emulator Testing**: Use LG webOS TV Simulator
2. **Real Device Testing**: Deploy to actual LG TV hardware
3. **Remote Control**: Test with physical TV remote control
4. **Performance**: Monitor TV-specific performance metrics

### Accessibility
- **High Contrast**: Design optimized for TV viewing distances
- **Large Click Targets**: Minimum 48px touch/focus targets
- **Clear Focus Indication**: Prominent focus rings and state changes
- **Screen Reader**: Proper ARIA labels and semantic HTML

## 🚀 Deployment

### Development
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
```

### webOS Production
```bash
npm run export       # Export static files
npm run webos-package # Create .ipk package
npm run webos-install # Install on connected TV
npm run webos-launch  # Launch app on TV
```

### Environment Variables
```env
# Required
NEXT_PUBLIC_TATAKAI_API_BASE=http://localhost:5000

# Optional
NEXT_PUBLIC_HIANIME_API_BASE=https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime
NEXT_PUBLIC_ANISKIP_API_BASE=https://api.aniskip.com/v2
```

## 🤝 Contributing

1. **Code Style**: Follow existing TypeScript and React patterns
2. **Components**: Create reusable, TV-optimized components
3. **Testing**: Test on both browser and webOS emulator
4. **Performance**: Consider TV hardware limitations
5. **Accessibility**: Maintain focus management and keyboard navigation

## 📄 License

This project is part of the Tatakai ecosystem. See the main repository for license information.

## 🔗 Related Projects

- **[Tatakai Backend](../tatakai-backend/)**: Node.js backend with authentication and user features
- **[Tatakai Web App](../tatakai-app/)**: Next.js web application for desktop/mobile
- **[Design System](../1design.json)**: Shared design tokens and component specifications

---

## 🛠️ Future Enhancements

### Planned Features
- [ ] Advanced Spatial Navigation with Norigin library
- [ ] Voice search integration with webOS voice APIs
- [ ] Advanced video player with PiP and quality controls
- [ ] Offline viewing capabilities with local storage
- [ ] Multi-user profiles with parental controls
- [ ] Advanced recommendation engine
- [ ] Integration with LG ThinQ for smart home features

### Technical Improvements
- [ ] PWA capabilities for faster loading
- [ ] Advanced caching strategies
- [ ] WebRTC integration for social features
- [ ] Advanced analytics and telemetry
- [ ] A/B testing framework for UI improvements

This documentation provides everything needed to develop, build, test, and deploy the Tatakai webOS TV app. For additional support, refer to the [LG webOS Developer Documentation](https://webostv.developer.lge.com/) and the main Tatakai repository.