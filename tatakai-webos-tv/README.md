# Tatakai webOS TV App

A production-ready Netflix-style anime streaming application designed for LG webOS smart TVs, built with Next.js, React, and optimized for remote control navigation.

## Features

- **TV-Optimized Interface**: Designed specifically for 10-foot viewing experience with large, readable typography
- **Remote Control Navigation**: Full support for LG TV remote control with arrow keys, OK, Back, and colored buttons
- **Netflix-Style Layout**: Hero section with auto-rotating spotlight and horizontal content rows
- **Spatial Navigation**: Advanced focus management for seamless DPAD navigation
- **Anime Streaming**: Integration with HiAnime API for thousands of anime titles
- **Design System**: Based on design tokens from `1design.json` for consistent theming
- **Performance Optimized**: Built for TV hardware limitations with efficient rendering

## Tech Stack

- **Framework**: Next.js 15 (App Router) with static export for webOS
- **UI**: Tailwind CSS with custom TV-optimized utilities
- **State Management**: TanStack Query for server state, Zustand for client state
- **Motion**: Framer Motion for smooth animations
- **Icons**: Lucide React
- **Platform**: LG webOS TV integration with native APIs

## Project Structure

```
tatakai-webos-tv/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page with hero and rows
│   ├── providers.tsx      # React Query and Focus providers
│   └── globals.css        # Global styles and TV utilities
├── components/            # React components
│   ├── layout/           # Header and navigation
│   ├── hero/             # Hero/billboard section
│   ├── rows/             # Content carousels
│   ├── cards/            # Anime cards
│   ├── player/           # Video player (planned)
│   └── dialogs/          # Modals and overlays (planned)
├── lib/                  # Utilities and integrations
│   ├── api-client.ts     # HiAnime API client
│   ├── focus-management.tsx  # TV focus and key handling
│   ├── webos-integration.ts  # LG webOS platform APIs
│   └── design-tokens.ts  # Design system integration
├── scripts/              # Build and packaging scripts
│   └── package-webos.js  # WebOS packaging utility
├── appinfo.json          # WebOS app manifest
├── next.config.js        # Next.js configuration for TV
└── tailwind.config.js    # TV-optimized Tailwind theme
```

## Quick Start

### 1. Clone and Setup
```bash
cd tatakai-webos-tv
npm install
cp .env.example .env.local
```

### 2. Development
```bash
npm run dev
# Open http://localhost:3000
# Test with keyboard navigation (arrows + enter)
```

### 3. Production Build
```bash
npm run build
npm run start
```

### 4. Deploy to webOS TV
```bash
# Build and package
npm run build
npm run webos:package

# Install webOS CLI (one-time)
npm install -g @webosose/ares-cli

# Deploy to TV
ares-package webos-package/
ares-install com.tatakai.webostv_1.0.0_all.ipk -d [YOUR_TV]
ares-launch com.tatakai.webostv -d [YOUR_TV]
```

## Building for webOS TV

### 1. Build the App

```bash
npm run build
```

This creates an optimized static export in the `dist/` directory.

### 2. Package for webOS

```bash
npm run webos:package
```

This creates a webOS-ready package in the `webos-package/` directory.

### 3. Deploy to TV

#### Install webOS CLI (one-time setup):
```bash
npm install -g @webosose/ares-cli
```

#### Connect to your TV:
```bash
ares-setup-device
# Follow prompts to add your TV
```

#### Install and launch:
```bash
# Package the app
ares-package webos-package/

# Install on TV
ares-install com.tatakai.webostv_1.0.0_all.ipk -d [DEVICE_NAME]

# Launch the app
ares-launch com.tatakai.webostv -d [DEVICE_NAME]
```

## API Integration

The app integrates with the HiAnime API for anime content:

- **Base URL**: `https://aniwatch-api-taupe-eight.vercel.app`
- **Endpoints**: Home page, search, anime details, episodes, streaming data
- **Features**: Trending, popular, latest episodes, genres, top 10 lists

See `lib/api-client.ts` for full API documentation.

## Remote Control Mapping

### Navigation Keys:
- **Arrow Keys**: Move focus between elements
- **OK/Enter**: Select focused element
- **Back**: Go back or close modals
- **Home**: Return to home screen

### Color Keys (Shortcuts):
- **Red Button**: Search
- **Green Button**: Profile/Account
- **Yellow Button**: Settings
- **Blue Button**: Help

### Media Keys:
- **Play/Pause**: Toggle playback
- **Rewind/Fast Forward**: Seek video
- **Stop**: Stop playback

## Design System

The app uses design tokens from `1design.json`:

- **Colors**: Dark theme with purple accent (#8A2BE2)
- **Typography**: TV-optimized font sizes (18px-48px)
- **Spacing**: Consistent spacing scale (4px-96px)
- **Focus**: High-contrast focus rings for accessibility
- **Motion**: Smooth animations optimized for TV hardware

## Performance Considerations

- **TV-Safe Areas**: 5% horizontal, 3% vertical padding
- **Large Touch Targets**: Minimum 48px for remote accuracy
- **Smooth Scrolling**: Hardware-accelerated transforms
- **Memory Management**: Efficient DOM rendering and cleanup
- **Network Handling**: Retry logic and offline graceful degradation

## Browser Compatibility

- **Primary**: webOS TV browser (Chromium-based)
- **Development**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Fallbacks**: Progressive enhancement for older TV browsers

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Test on TV resolution (1920x1080)
4. Ensure keyboard-only navigation works
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Check the browser console for errors
- Test network connectivity to API endpoints
- Verify webOS TV compatibility
- Review focus management and key handling