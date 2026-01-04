# Tatakai Android App - Implementation Notes

## 📱 Project Overview

This is a **native Android application** for the Tatakai anime streaming platform, built with modern Android development practices and technologies.

### Architecture: MVVM (Model-View-ViewModel)

```
┌─────────────────┐
│   Presentation  │  <- Jetpack Compose UI + ViewModels
├─────────────────┤
│     Domain      │  <- Use Cases + Models
├─────────────────┤
│      Data       │  <- Repositories + Data Sources
└─────────────────┘
```

## 🎨 Theme System

The app implements all **15 themes** from the web application:

### Implementation Details

**Location:** `ui/theme/Theme.kt`

Each theme includes:
- Primary, Secondary, Accent colors
- Background and Surface colors
- Glow colors for effects
- Light/Dark mode indicator

**Usage:**
```kotlin
TatakaiTheme(themeType = ThemeType.MIDNIGHT) {
    // Your composable content
}
```

**Theme Storage:**
- Stored in DataStore Preferences
- Persists across app sessions
- Synced with user's Supabase profile

### Available Themes

#### Dark Themes (13)
1. **Midnight** - Indigo & violet
2. **Cherry Blossom** - Pink sakura tones
3. **Neon Tokyo** - Cyberpunk neon
4. **Aurora Borealis** - Northern lights
5. **Deep Ocean** - Underwater blues
6. **Cyberpunk** - Yellow & cyan futuristic
7. **Zen Garden** - Calm green forest
8. **Brutalist Dark** - Yellow & red on dark
9. **Obsidian** - Monochrome elegance
10. **Solar** - Bright solar yellow
11. **Caffeine** - Coffee-inspired orange
12. **Brutalist Plus** - White with vibrant accents
13. **Dark Matter** - Cosmic purple

#### Light Themes (2)
14. **Light Minimal** - Clean bright blue
15. **Light Sakura** - Soft pink cherry blossom

## 🎮 Haptic Feedback System

**Location:** `utils/haptic/HapticFeedback.kt`

### Haptic Types

| Function | Use Case | Duration |
|----------|----------|----------|
| `light()` | Buttons, switches | 10ms |
| `medium()` | Selections, navigation | 25ms |
| `heavy()` | Delete, errors | 50ms |
| `success()` | Add to favorites, download complete | Pattern |
| `error()` | Failed actions, validation | Pattern |
| `selectionChange()` | Video scrubbing, sliders | 5ms |
| `longPress()` | Context menus | Pattern |

### Usage Example
```kotlin
val haptic = rememberHapticFeedback()

Button(onClick = {
    haptic.medium()
    // Handle click
}) {
    Text("Click Me")
}
```

## 📹 Video Player (ExoPlayer)

**Location:** `integrations/exoplayer/VideoPlayer.kt`

### Features
- HLS streaming support
- Quality selection
- AniSkip integration (intro/outro skip)
- Progress tracking
- Playback speed control
- Picture-in-Picture support (to be implemented)

### Usage
```kotlin
val playerManager = VideoPlayerManager(context)

LaunchedEffect(Unit) {
    playerManager.initialize()
    playerManager.loadVideo(videoUrl, isHls = true)
    playerManager.play()
}

DisposableEffect(Unit) {
    onDispose {
        playerManager.release()
    }
}
```

### AniSkip Integration
```kotlin
// Set skip times (in milliseconds)
playerManager.setSkipIntro(start = 85000, end = 115000) // 1:25 - 1:55
playerManager.setSkipOutro(start = 1320000, end = 1380000) // 22:00 - 23:00

// Check and skip
if (playerManager.checkAndSkipIntro()) {
    // Intro skipped
}
```

## 💾 Download System

**Location:** `utils/download/DownloadManager.kt`

### Features
- Background downloads via foreground service
- Progress tracking
- Pause/resume capability
- Storage management
- Quality selection

### Download Flow
```kotlin
val downloadManager = DownloadManager(context)

// Create download info
val downloadInfo = DownloadManager.DownloadInfo(
    id = "episode-123",
    animeId = "anime-456",
    episodeId = "ep-1",
    episodeNumber = 1,
    animeTitle = "My Anime",
    url = "https://...",
    quality = "1080p"
)

// Start download
downloadManager.startDownload(downloadInfo)

// Monitor progress
val downloadState = downloadManager.getDownloadState("episode-123")
    .collectAsState()

when (downloadState.value) {
    is DownloadState.Downloading -> {
        val progress = (downloadState.value as DownloadState.Downloading).progress
        // Show progress
    }
    is DownloadState.Completed -> {
        // Download finished
    }
    // ... other states
}
```

### Storage Management
```kotlin
// Get total size
val totalSize = downloadManager.getDownloadedSize()

// Delete specific download
downloadManager.deleteDownload(filePath)

// Clear all downloads
downloadManager.clearAllDownloads()
```

## 🔐 Supabase Integration

**Location:** `integrations/supabase/SupabaseClient.kt`

### Initialization
In `TatakaiApplication.onCreate()`:
```kotlin
SupabaseClient.initialize(this)
```

### Authentication
```kotlin
// Sign up
val result = SupabaseClient.auth.signUpWith(Email) {
    email = "user@example.com"
    password = "password123"
}

// Sign in
val result = SupabaseClient.auth.signInWith(Email) {
    email = "user@example.com"
    password = "password123"
}

// Sign out
SupabaseClient.auth.signOut()

// Get current user
val user = SupabaseClient.auth.currentUserOrNull()
```

### Database Operations
```kotlin
// Fetch data
val animes = SupabaseClient.postgrest
    .from("watchlist")
    .select()
    .decodeList<WatchlistItem>()

// Insert data
SupabaseClient.postgrest
    .from("watch_history")
    .insert(watchHistoryItem)

// Update data
SupabaseClient.postgrest
    .from("profiles")
    .update({ set("theme", newTheme) }) {
        eq("id", userId)
    }
```

## 🌐 Consumet API Integration

**Location:** `integrations/consumet/`

### API Endpoints
- Search anime: `GET /anime/gogoanime/{query}`
- Get anime info: `GET /anime/gogoanime/info/{id}`
- Get streaming links: `GET /anime/gogoanime/watch/{episodeId}`
- Get recent episodes: `GET /anime/gogoanime/recent-episodes`
- Get top airing: `GET /anime/gogoanime/top-airing`
- Get popular: `GET /anime/gogoanime/popular`
- Get by genre: `GET /anime/gogoanime/genre/{genre}`

### Usage Example
```kotlin
val api = ConsumetClient.api

// Search anime
val searchResult = api.searchAnime("naruto", page = 1)

// Get anime info
val animeInfo = api.getAnimeInfo("naruto-dub")

// Get streaming links
val streamingData = api.getStreamingLinks("naruto-episode-1")
```

## 🗂️ Data Models

**Location:** `domain/model/AnimeModels.kt`

### Core Models
- `Anime` - Anime information
- `Episode` - Episode details
- `VideoSource` - Streaming source with quality
- `StreamingData` - Complete streaming info with sources and subtitles
- `WatchHistoryItem` - User watch history
- `WatchlistItem` - User watchlist
- `DownloadedEpisode` - Downloaded episode metadata
- `UserProfile` - User profile data
- `Comment` - User comments

## 🧭 Navigation

**Location:** `ui/navigation/Navigation.kt`

### Routes
- `home` - Home screen with trending, continue watching
- `search` - Search and discovery
- `watchlist` - User collections (watchlist, favorites, history)
- `profile` - User profile and settings
- `anime/{animeId}` - Anime detail screen
- `player/{animeId}/{episodeId}` - Video player
- `downloads` - Download management
- `settings` - App settings
- `login` - Authentication

### Navigation Example
```kotlin
navController.navigate("anime/naruto-dub")
navController.navigate("player/naruto-dub/episode-1")
```

## 📱 Screens

### Home Screen
- Featured/Hero section
- Continue watching carousel
- Trending anime
- Recommendations

### Search Screen
- Search bar with real-time results
- Genre filter chips
- Grid layout results
- Sort and filter options

### Watchlist Screen
- Three tabs: Watchlist, Favorites, History
- Grid layout
- Progress indicators for history

### Profile Screen
- User avatar and info
- Theme selection
- Downloads management
- Settings access
- Sign out

### Anime Detail Screen
- Cover image with gradient overlay
- Title, genres, metadata
- Action buttons (Watch, Add to list)
- Episodes list with download buttons
- Description and details

### Video Player Screen
- Full-screen ExoPlayer
- Custom controls overlay
- Skip intro/outro buttons
- Quality selector
- Progress bar

### Downloads Screen
- Storage usage card
- Downloaded episodes list
- Play/delete actions per episode
- Clear all option

### Settings Screen
- Theme selector dialog
- Video quality dropdown
- Download quality dropdown
- Haptic feedback toggle
- Auto-play toggle
- App version info

## 🧩 Reusable Components

**Location:** `ui/components/`

### AnimeCard
```kotlin
AnimeCard(
    title = "Anime Title",
    imageUrl = "https://...",
    onClick = { /* Navigate */ },
    showProgress = true,
    progress = 45
)
```

### SectionHeader
```kotlin
SectionHeader(
    title = "Trending Now",
    onSeeAllClick = { /* Navigate */ }
)
```

## 🔄 State Management

### ViewModel Pattern
```kotlin
class HomeViewModel : ViewModel() {
    private val _animes = MutableStateFlow<List<Anime>>(emptyList())
    val animes: StateFlow<List<Anime>> = _animes
    
    fun loadAnimes() {
        viewModelScope.launch {
            val result = repository.getTrendingAnimes()
            _animes.value = result
        }
    }
}
```

### Usage in Composable
```kotlin
@Composable
fun HomeScreen(viewModel: HomeViewModel = viewModel()) {
    val animes by viewModel.animes.collectAsState()
    
    LaunchedEffect(Unit) {
        viewModel.loadAnimes()
    }
    
    // Display animes
}
```

## 🎯 Best Practices

### Compose
- Keep composables small and focused
- Use `remember` and `rememberSaveable` appropriately
- Hoist state when needed
- Use side effects (LaunchedEffect, DisposableEffect) correctly

### Coroutines
- Use `viewModelScope` in ViewModels
- Handle exceptions with try-catch
- Use appropriate dispatchers (IO, Main, Default)

### Performance
- Use `LazyColumn`/`LazyRow` for lists
- Implement image caching with Coil
- Avoid unnecessary recompositions
- Use `derivedStateOf` for computed values

### Error Handling
- Always wrap network calls in try-catch
- Provide meaningful error messages
- Implement retry mechanisms
- Show loading and error states

## 🐛 Common Issues & Solutions

### Issue: App crashes on launch
**Solution:** Check Supabase credentials in `gradle.properties`

### Issue: Video won't play
**Solution:** 
- Verify HLS URL is valid
- Check internet connectivity
- Ensure ExoPlayer is properly initialized

### Issue: Downloads fail
**Solution:**
- Check storage permissions
- Verify sufficient storage space
- Check network connectivity

### Issue: Themes not persisting
**Solution:**
- Verify DataStore initialization
- Check theme save/load logic in MainActivity

## 📊 Performance Metrics

### Target Metrics
- App startup: < 2 seconds
- Video playback start: < 3 seconds
- Search results: < 1 second
- Screen transitions: < 300ms

### Optimization Tips
- Use R8 shrinking for release builds
- Enable resource shrinking
- Optimize image sizes
- Implement lazy loading
- Cache frequently accessed data

## 🔒 Security Considerations

### API Keys
- Never commit `gradle.properties` with real keys
- Use environment variables for CI/CD
- Rotate keys regularly

### User Data
- Encrypt sensitive data
- Follow GDPR guidelines
- Implement proper authentication
- Secure local storage

## 🚀 Deployment

### Debug Build
```bash
./gradlew assembleDebug
```

### Release Build
```bash
./gradlew assembleRelease --stacktrace
```

### Generate AAB
```bash
./gradlew bundleRelease
```

## 📚 Additional Resources

- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Material Design 3](https://m3.material.io/)
- [ExoPlayer](https://exoplayer.dev/)
- [Supabase Android](https://supabase.com/docs/reference/kotlin)
- [Consumet API](https://docs.consumet.org/)

---

**Version:** 1.0.0
**Last Updated:** 2024-01-04
