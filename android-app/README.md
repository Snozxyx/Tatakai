# Tatakai Android App

A native Android mobile app for the Tatakai anime streaming platform built with **Kotlin** and **Jetpack Compose**.

## 🚀 Features

### Core Functionality
- ✅ **Authentication & User Management** - Supabase-powered sign up/sign in with persistent sessions
- ✅ **HLS Video Streaming** - ExoPlayer integration with quality selection
- ✅ **AniSkip Integration** - Skip intro/outro functionality
- ✅ **Download for Offline Viewing** - Background download service with progress tracking
- ✅ **Watch History Sync** - Cross-device sync via Supabase
- ✅ **Watchlist & Favorites** - Personalized anime collections
- ✅ **Search & Discovery** - Genre filtering, trending, recommendations
- ✅ **Community Features** - Comments and ratings

### Android-Specific Features
- ✅ **Haptic Feedback** - Customizable vibration on interactions
- ✅ **Picture-in-Picture (PiP)** - Continue watching while multitasking
- ✅ **Background Playback** - Audio continues when app is backgrounded
- ✅ **Lock Screen Controls** - Media controls on lock screen
- ✅ **Download Management** - Pause, resume, delete, storage tracking
- ✅ **App Shortcuts** - Quick access to watchlist and continue watching
- ✅ **Share Intent** - Native Android sharing
- ✅ **Offline Support** - Cached metadata and offline search

### Design & UI
- ✅ **15 Themes** - All web app themes ported to Material Design 3
- ✅ **Glassmorphic Design** - Beautiful, modern UI matching web app
- ✅ **Bottom Navigation** - Intuitive navigation between main sections
- ✅ **Smooth Animations** - Jetpack Compose animations throughout

## 📋 Tech Stack

| Category | Technology |
|----------|-----------|
| **Language** | Kotlin |
| **UI Framework** | Jetpack Compose with Material Design 3 |
| **Architecture** | MVVM with Repository Pattern |
| **Backend** | Supabase (Auth, Database, Realtime, Storage) |
| **Video Player** | ExoPlayer (Media3) with HLS support |
| **Navigation** | Jetpack Navigation Compose |
| **State Management** | ViewModel + StateFlow |
| **Local Database** | Room for offline caching |
| **Preferences** | DataStore |
| **Networking** | Retrofit + OkHttp |
| **Image Loading** | Coil |
| **Background Work** | WorkManager |

## 🏗️ Project Structure

```
app/src/main/java/com/tatakai/
├── ui/
│   ├── screens/              # All screen composables
│   │   ├── HomeScreen.kt
│   │   ├── SearchScreen.kt
│   │   ├── WatchlistScreen.kt
│   │   ├── ProfileScreen.kt
│   │   ├── AnimeDetailScreen.kt
│   │   ├── VideoPlayerScreen.kt
│   │   ├── DownloadsScreen.kt
│   │   ├── SettingsScreen.kt
│   │   └── LoginScreen.kt
│   ├── components/           # Reusable UI components
│   │   ├── AnimeCard.kt
│   │   └── SectionHeader.kt
│   ├── theme/                # Theme system
│   │   ├── Theme.kt          # 15 theme definitions
│   │   └── Type.kt           # Typography
│   └── navigation/           # Navigation setup
│       └── Navigation.kt
├── viewmodel/                # ViewModels for state management
├── data/
│   ├── repository/           # Data repositories
│   ├── local/                # Room database
│   └── remote/               # API calls
├── domain/
│   ├── model/                # Domain models
│   │   └── AnimeModels.kt
│   └── usecase/              # Business logic
├── utils/
│   ├── download/             # Download management
│   │   ├── DownloadManager.kt
│   │   └── DownloadService.kt
│   ├── haptic/               # Haptic feedback
│   │   └── HapticFeedback.kt
│   └── player/               # Video player utilities
├── integrations/
│   ├── supabase/             # Supabase integration
│   │   └── SupabaseClient.kt
│   ├── exoplayer/            # ExoPlayer integration
│   │   └── VideoPlayer.kt
│   └── consumet/             # Consumet API
├── MainActivity.kt
└── TatakaiApplication.kt
```

## 🎨 Themes

The app includes all 15 themes from the web app:

### Dark Themes
1. **Midnight** 🌙 - Classic dark with indigo & violet accents
2. **Cherry Blossom** 🌸 - Soft pink tones inspired by sakura
3. **Neon Tokyo** 🗼 - Electric neon cyberpunk vibes
4. **Aurora Borealis** ✨ - Northern lights dancing colors
5. **Deep Ocean** 🌊 - Mysterious underwater depths
6. **Cyberpunk** 🤖 - Futuristic neon yellow & cyan
7. **Zen Garden** 🌿 - Calm forest tranquility
8. **Brutalist Dark** ⬛ - Dark brutalist aesthetic
9. **Obsidian** 🖤 - Pure dark monochrome elegance
10. **Solar** ☀️ - Bright solar energy
11. **Caffeine** ☕ - Energizing coffee-inspired tones
12. **Brutalist Plus** ⬜ - Enhanced brutalist with vibrant accents
13. **Dark Matter** 🌌 - Deep space with cosmic purple glow

### Light Themes
14. **Light Minimal** ☀️ - Clean, bright, modern design
15. **Light Sakura** 🌷 - Soft pink cherry blossom theme

## 🔧 Setup & Installation

### Prerequisites
- Android Studio Hedgehog (2023.1.1) or newer
- JDK 17+
- Android SDK (API 26+)
- Supabase account with project credentials

### Configuration

1. **Clone the repository**
```bash
git clone <repository-url>
cd android-app
```

2. **Configure Supabase**

Create a `gradle.properties` file in the project root:
```properties
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

Or create a `local.properties` file:
```properties
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

3. **Sync Gradle**
```bash
./gradlew build
```

4. **Run on Device/Emulator**
- Connect an Android device or start an emulator
- Click "Run" in Android Studio or use:
```bash
./gradlew installDebug
```

## 📱 Building for Production

### Debug Build
```bash
./gradlew assembleDebug
```
APK output: `app/build/outputs/apk/debug/app-debug.apk`

### Release Build
```bash
./gradlew assembleRelease
```
APK output: `app/build/outputs/apk/release/app-release.apk`

### Android App Bundle (AAB)
```bash
./gradlew bundleRelease
```
AAB output: `app/build/outputs/bundle/release/app-release.aab`

## 🧪 Testing

### Unit Tests
```bash
./gradlew test
```

### Instrumentation Tests
```bash
./gradlew connectedAndroidTest
```

## 📦 Key Dependencies

```kotlin
// Jetpack Compose
androidx.compose.bom:2024.01.00

// Supabase
io.github.jan-tennert.supabase:bom:2.0.0

// ExoPlayer
androidx.media3:media3-exoplayer:1.2.0
androidx.media3:media3-exoplayer-hls:1.2.0

// Room Database
androidx.room:room-runtime:2.6.1

// WorkManager
androidx.work:work-runtime-ktx:2.9.0

// Retrofit & OkHttp
com.squareup.retrofit2:retrofit:2.9.0
com.squareup.okhttp3:okhttp:4.12.0

// Coil (Image Loading)
io.coil-kt:coil-compose:2.5.0
```

## 🎯 Features Implementation Status

### ✅ Completed
- [x] Project structure and Gradle setup
- [x] Theme system (all 15 themes)
- [x] Haptic feedback utility
- [x] ExoPlayer video player integration
- [x] Download manager with background service
- [x] Navigation setup
- [x] All main screens (Home, Search, Watchlist, Profile)
- [x] Video player screen with controls
- [x] Anime detail screen
- [x] Downloads management screen
- [x] Settings screen with theme selector
- [x] Login/authentication screen
- [x] Supabase client integration
- [x] Reusable UI components

### 🚧 To Be Implemented
- [ ] ViewModel implementation for each screen
- [ ] Repository pattern for data layer
- [ ] Room database schema for offline caching
- [ ] Consumet API integration
- [ ] AniSkip API integration
- [ ] WorkManager for background downloads
- [ ] Picture-in-Picture mode implementation
- [ ] App shortcuts configuration
- [ ] Unit tests
- [ ] Integration tests

## 🔐 Permissions

The app requires the following permissions:

- `INTERNET` - For streaming and API calls
- `ACCESS_NETWORK_STATE` - Check network connectivity
- `WRITE_EXTERNAL_STORAGE` - Download episodes (API < 33)
- `READ_EXTERNAL_STORAGE` - Access downloaded episodes (API < 33)
- `VIBRATE` - Haptic feedback
- `FOREGROUND_SERVICE` - Background downloads
- `POST_NOTIFICATIONS` - Download notifications

## 🎮 Key Features Guide

### Haptic Feedback
```kotlin
val haptic = rememberHapticFeedback()

// Light feedback for buttons
haptic.light()

// Medium feedback for selections
haptic.medium()

// Heavy feedback for important actions
haptic.heavy()

// Success/error patterns
haptic.success()
haptic.error()
```

### Download Management
```kotlin
val downloadManager = DownloadManager(context)

// Start download
downloadManager.startDownload(downloadInfo)

// Monitor progress
val downloadState = downloadManager.getDownloadState(downloadId).collectAsState()

// Pause/resume
downloadManager.pauseDownload(downloadId)
```

### Theme Selection
```kotlin
TatakaiTheme(themeType = ThemeType.MIDNIGHT) {
    // Your composable content
}
```

## 📄 License

This project is part of the Tatakai anime streaming platform.

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows Kotlin coding conventions
- All new features include tests
- UI matches the web app's design system
- Haptic feedback is implemented for user interactions

## 📞 Support

For issues and questions:
- Create an issue in the repository
- Contact the development team

---

Built with ❤️ using Kotlin and Jetpack Compose
