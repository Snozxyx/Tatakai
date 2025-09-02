# Tatakai webOS App

A fully functional anime streaming application designed for LG webOS smart TVs, built with remote control navigation and TV-optimized user interface.

## Features

- **TV-Optimized Interface**: Designed specifically for 10-foot viewing experience
- **Remote Control Navigation**: Full support for LG TV remote control with arrow keys, OK, Back, and colored buttons
- **Anime Streaming**: Access to thousands of anime titles with multiple quality options
- **Search Functionality**: Advanced search with suggestions and filters
- **Categories & Genres**: Browse anime by various categories and genres
- **Video Player**: Custom video player with HLS support and subtitle options
- **Spotlight Carousel**: Featured anime with auto-rotation
- **Responsive Design**: Supports multiple TV resolutions (1080p, 720p)

## API Integration

This app uses the HiAnime API with the following endpoints:

- **Base URL**: `https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime`
- **Home Page**: `/home` - Get featured and trending anime
- **Search**: `/search?q={query}` - Search for anime with advanced filters
- **Anime Details**: `/anime/{animeId}` - Get detailed anime information
- **Episodes**: `/anime/{animeId}/episodes` - Get episode list
- **Video Sources**: `/episode/sources?animeEpisodeId={id}&server={server}&category={category}`

## Remote Control Features

### Navigation
- **Arrow Keys**: Navigate between UI elements
- **OK/Enter**: Select current item
- **Back**: Go to previous screen or exit
- **Home**: Return to home screen

### Special Functions
- **Red Button**: Quick search
- **Green Button**: Favorites (coming soon)
- **Yellow Button**: Settings (coming soon)
- **Blue Button**: Categories view

### Video Playback
- **Play/Pause**: Toggle video playback
- **Left/Right Arrows**: Rewind/Fast forward (10 seconds)
- **Up/Down Arrows**: Volume control
- **Rewind/Fast Forward**: Skip 30 seconds
- **Red Button**: Toggle subtitles
- **Green Button**: Change quality
- **Blue Button**: Toggle fullscreen

## Installation

### For webOS Development

1. Install webOS CLI tools:
   ```bash
   npm install -g @webosose/ares-cli
   ```

2. Package the app:
   ```bash
   cd tatakai-webos-app
   ares-package .
   ```

3. Install on webOS device:
   ```bash
   ares-install com.tatakai.animeapp_1.0.0_all.ipk
   ```

4. Launch the app:
   ```bash
   ares-launch com.tatakai.animeapp
   ```

### For Development/Testing

1. Start local server:
   ```bash
   npm run serve
   ```

2. Open in browser:
   ```
   http://localhost:8080
   ```

## File Structure

```
tatakai-webos-app/
├── appinfo.json          # webOS app configuration
├── index.html            # Main HTML file
├── package.json          # Package configuration
├── icon.png              # App icon (80x80)
├── bg.png                # Background image
├── css/
│   ├── style.css         # Base styles
│   └── tv-ui.css         # TV-specific UI optimizations
├── js/
│   ├── api-client.js     # HiAnime API client
│   ├── webos-api.js      # webOS platform integration
│   ├── navigation.js     # Remote control navigation
│   ├── ui-manager.js     # UI state management
│   ├── video-player.js   # Video playback handling
│   └── app.js            # Main application entry point
└── README.md             # This file
```

## Key Components

### API Client (`api-client.js`)
- Handles all API calls to HiAnime backend
- Implements error handling and retry logic
- Supports all documented endpoints

### Navigation Manager (`navigation.js`)
- Advanced 2D navigation for TV remote controls
- Smart focus management with spatial navigation
- Keyboard and remote control event handling

### UI Manager (`ui-manager.js`)
- Manages screen transitions and content loading
- Handles anime data rendering and grid layouts
- Implements search functionality and results display

### Video Player (`video-player.js`)
- Custom video player optimized for TV
- HLS streaming support with quality selection
- Subtitle support and remote control integration

### webOS Integration (`webos-api.js`)
- Platform detection and webOS service integration
- TV-specific APIs and features
- Graceful fallback for web development

## TV Optimization Features

### Focus Management
- Spatial navigation algorithm for intuitive remote control use
- Visual focus indicators with smooth animations
- Automatic scroll-into-view for focused elements

### Performance
- Optimized for TV hardware limitations
- Efficient DOM rendering and memory management
- Background resource cleanup when app is paused

### Accessibility
- High contrast design for TV viewing
- Large clickable areas for remote control accuracy
- Clear visual feedback for all interactions

## Development Notes

### Testing
- Use browser dev tools to simulate TV resolutions
- Test with keyboard navigation (arrows + enter)
- Verify focus management and scroll behavior

### webOS Specific Features
- App lifecycle management (pause/resume)
- TV display mode optimization
- Platform-specific error handling

### API Considerations
- All API calls include proper error handling
- Network timeouts and retry logic implemented
- Graceful degradation for API failures

## Supported Resolutions

- **1920x1080** (Full HD) - Primary target
- **1366x768** (HD Ready) - Responsive support
- Auto-scaling for other TV resolutions

## Browser Compatibility

- **webOS Browser** (primary target)
- **Chrome/Chromium** (development)
- **Safari** (HLS native support)
- **Firefox** (with hls.js fallback)

## License

MIT License - See package.json for details

## Contributing

This is a functional webOS app implementation. For improvements or bug reports, please ensure testing on actual webOS devices or webOS emulator.