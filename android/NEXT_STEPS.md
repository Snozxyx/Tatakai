# Android App - Next Implementation Steps

## ✅ Completed So Far

1. **HomeScreen with ViewModel** - Full UI with real data loading, spotlight banner, trending, top 10, latest episodes
2. **Material Icons Extended** - Added for enhanced UI icons
3. **Complete Architecture** - Network layer, database, ExoPlayer, proxy system all working

---

## 🚀 Remaining Implementation (Priority Order)

### Phase 1: Complete Core Screens ViewModels & UI

#### 1. AnimeDetailScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/AnimeDetailViewModel.kt
class AnimeDetailViewModel(animeId: String) : ViewModel() {
    fun loadAnimeInfo()
    fun loadEpisodes()
    fun addToWatchlist()
    fun rateAnime()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/anime/AnimeDetailScreen.kt
// Add: Poster, description, genres, stats, episode grid, related anime carousel
```

#### 2. SearchScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/SearchViewModel.kt
class SearchViewModel : ViewModel() {
    fun search(query: String)
    fun filterByGenre(genre: String)
    fun loadNextPage()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/search/SearchScreen.kt
// Add: Search bar with debounce, genre chips, paginated grid
```

#### 3. PlayerScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/PlayerViewModel.kt
class PlayerViewModel(episodeId: String) : ViewModel() {
    fun loadStreamingSources()
    fun saveProgress()
    fun loadSkipTimes()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/player/PlayerScreen.kt
// Add: ExoPlayer PlayerView, skip intro/outro buttons, quality selector, subtitle selector
```

#### 4. WatchlistScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/WatchlistViewModel.kt
class WatchlistViewModel : ViewModel() {
    fun loadByStatus(status: String)
    fun removeFromWatchlist()
    fun updateStatus()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/watchlist/WatchlistScreen.kt
// Add: 5 tabs (Watching, Completed, Plan to Watch, Dropped, On Hold), anime grid
```

#### 5. DownloadsScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/DownloadsViewModel.kt
class DownloadsViewModel : ViewModel() {
    fun queueDownload()
    fun pauseDownload()
    fun cancelDownload()
    fun deleteDownload()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/downloads/DownloadsScreen.kt
// Add: Active downloads list, completed downloads library, progress indicators
```

#### 6. ProfileScreen + ViewModel
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/viewmodels/ProfileViewModel.kt
class ProfileViewModel : ViewModel() {
    fun loadUserProfile()
    fun updateTheme()
    fun updatePreferences()
    fun signOut()
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/profile/ProfileScreen.kt
// Add: User info, theme selector, settings, preferences
```

---

### Phase 2: Implement Supabase Auth & Sync

#### Setup Supabase Kotlin Client
```kotlin
// Update: android/app/build.gradle.kts
dependencies {
    implementation("io.github.jan-tennert.supabase:postgrest-kt:2.0.1")
    implementation("io.github.jan-tennert.supabase:gotrue-kt:2.0.1")
    implementation("io.ktor:ktor-client-android:2.3.7")
}

// Create: android/app/src/main/java/com/tatakai/app/data/remote/SupabaseClient.kt
object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        install(Postgrest)
        install(GoTrue)
    }
}
```

#### Auth Implementation
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/data/auth/AuthManager.kt
class AuthManager {
    suspend fun signIn(email: String, password: String)
    suspend fun signUp(email: String, password: String)
    suspend fun signOut()
    fun getCurrentUser(): User?
}

// Update: android/app/src/main/java/com/tatakai/app/ui/screens/auth/LoginScreen.kt
// Add: Email/password inputs, sign in/up buttons, form validation
```

#### Watch History Sync
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/data/sync/WatchHistorySyncManager.kt
class WatchHistorySyncManager {
    suspend fun syncProgress(animeId: String, episode: Int, progressMs: Long)
    suspend fun fetchRemoteProgress(animeId: String, episode: Int)
}
```

#### Watchlist Sync
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/data/sync/WatchlistSyncManager.kt
class WatchlistSyncManager {
    suspend fun syncWatchlist()
    suspend fun addToRemote(anime: WatchlistEntity)
    suspend fun removeFromRemote(animeId: String)
}
```

---

### Phase 3: Download & Offline System

#### WorkManager Download Implementation
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/workers/DownloadWorker.kt
class DownloadWorker : CoroutineWorker() {
    override suspend fun doWork(): Result {
        // Fetch streaming sources
        // Download HLS video segments
        // Save to app-private storage
        // Update DownloadEntity in Room
        // Show notification progress
    }
}

// Create: android/app/src/main/java/com/tatakai/app/data/download/DownloadManager.kt
class DownloadManager {
    fun queueDownload(animeId: String, episodeId: String, quality: String)
    fun pauseDownload(id: String)
    fun cancelDownload(id: String)
    fun getDownloadedEpisodes(): Flow<List<DownloadEntity>>
}
```

#### Offline Playback
```kotlin
// Update: android/app/src/main/java/com/tatakai/app/utils/player/ExoPlayerManager.kt
fun playOfflineEpisode(filePath: String) {
    // Load from local file instead of network
}
```

---

### Phase 4: Player Features

#### Quality Selector Bottom Sheet
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/components/QualitySelectorBottomSheet.kt
@Composable
fun QualitySelectorBottomSheet(
    sources: List<StreamingSource>,
    onQualitySelected: (Int) -> Unit
)
```

#### Subtitle Selector
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/components/SubtitleSelectorBottomSheet.kt
@Composable
fun SubtitleSelectorBottomSheet(
    subtitles: List<Subtitle>,
    onSubtitleSelected: (Int) -> Unit
)
```

#### Skip Intro/Outro Buttons
```kotlin
// Add to PlayerScreen
// Show "Skip Intro" button when intro.start <= currentTime <= intro.end
// Show "Skip Outro" button when outro.start <= currentTime <= outro.end
```

#### Picture-in-Picture
```kotlin
// Add PiP support to PlayerScreen
val activity = LocalContext.current as Activity
LaunchedEffect(Unit) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        activity.enterPictureInPictureMode(
            PictureInPictureParams.Builder().build()
        )
    }
}
```

---

### Phase 5: Advanced Features

#### Comments System
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/components/CommentsSection.kt
@Composable
fun CommentsSection(
    animeId: String,
    episodeId: String?
)

// Create: android/app/src/main/java/com/tatakai/app/data/remote/CommentsRepository.kt
```

#### Ratings System
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/components/RatingDialog.kt
@Composable
fun RatingDialog(
    currentRating: Int?,
    onRatingSubmit: (Int, String?) -> Unit
)
```

#### Haptic Feedback
```kotlin
// Add to all clickable items
val haptics = LocalHapticFeedback.current
modifier.clickable {
    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    onClick()
}
```

#### App Shortcuts
```kotlin
// Create: android/app/src/main/res/xml/shortcuts.xml
<shortcuts>
    <shortcut
        android:shortcutId="continue_watching"
        android:icon="@drawable/ic_play"
        android:shortcutShortLabel="@string/continue_watching" />
</shortcuts>
```

---

### Phase 6: Polish & Optimization

#### Loading Skeletons
```kotlin
// Create: android/app/src/main/java/com/tatakai/app/ui/components/AnimeCardSkeleton.kt
@Composable
fun AnimeCardSkeleton()
```

#### Pull to Refresh
```kotlin
// Add to HomeScreen, WatchlistScreen
val refreshing by viewModel.isRefreshing.collectAsState()
val pullRefreshState = rememberPullRefreshState(refreshing, { viewModel.refresh() })
```

#### Shared Element Transitions
```kotlin
// Add shared element transitions between anime card and detail screen
```

#### Dark/Light Theme Toggle
```kotlin
// Add theme preference in ProfileScreen
// Store in DataStore
// Update TatakaiTheme composable
```

---

## 📦 Required Files to Create

### ViewModels (7 files)
- ✅ `HomeViewModel.kt`
- `AnimeDetailViewModel.kt`
- `SearchViewModel.kt`
- `PlayerViewModel.kt`
- `WatchlistViewModel.kt`
- `DownloadsViewModel.kt`
- `ProfileViewModel.kt`

### Repositories (5 files)
- `CommentsRepository.kt`
- `RatingsRepository.kt`
- `WatchHistorySyncManager.kt`
- `WatchlistSyncManager.kt`
- `DownloadManager.kt`

### Workers (1 file)
- `DownloadWorker.kt`

### Components (10 files)
- `AnimeCardSkeleton.kt`
- `QualitySelectorBottomSheet.kt`
- `SubtitleSelectorBottomSheet.kt`
- `CommentsSection.kt`
- `RatingDialog.kt`
- `EpisodeListItem.kt`
- `GenreChip.kt`
- `SearchBar.kt`
- `DownloadProgressCard.kt`
- `ThemeSelectorGrid.kt`

### Auth & Sync (3 files)
- `AuthManager.kt`
- `SupabaseClient.kt`
- Update `LoginScreen.kt` with real forms

---

## 🎯 Priority Tasks (Complete These First)

1. ✅ **HomeScreen with ViewModel** (DONE)
2. **AnimeDetailScreen with ViewModel** - Users need to see anime info and episodes
3. **PlayerScreen with ExoPlayer UI** - Core feature for watching anime
4. **Supabase Auth Setup** - Enable user accounts
5. **DownloadManager Implementation** - Key differentiator from web app

---

## 🧪 Testing Checklist

- [ ] Home screen loads data and displays correctly
- [ ] Anime detail screen shows metadata and episodes
- [ ] Video player plays HLS streams with subtitles
- [ ] Downloads work and can be played offline
- [ ] Watch progress syncs across devices
- [ ] Watchlist CRUD operations work
- [ ] Search with genre filters works
- [ ] Theme switching persists
- [ ] PiP mode works
- [ ] App doesn't crash on rotation

---

## 📝 Notes

- All screens should handle loading, error, and empty states
- Use Coil for image loading with placeholder/error images
- Add proper error messages and retry mechanisms
- Implement proper lifecycle management (cancel coroutines on destroy)
- Use LaunchedEffect for side effects
- Follow Material 3 design guidelines
- Add proper accessibility labels
- Test on multiple screen sizes

---

**Status**: HomeScreen is now fully implemented with real data. Next priority is AnimeDetailScreen + PlayerScreen for core functionality.
