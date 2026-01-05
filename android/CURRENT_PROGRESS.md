# Tatakai Android - Current Implementation Progress

## ✅ Just Completed

### 1. AnimeDetailScreen - FULLY IMPLEMENTED
- ✅ **AnimeDetailViewModel** with StateFlow  - ✅ **Full UI Implementation** with:
  - Hero section with poster and gradient overlay
  - Metadata display (genres, status, studios, duration)
  - Episodes grid (4 columns) with filler highlighting
  - Recommended anime carousel
  - Related anime carousel
  - Loading/Error/Success states
- ✅ **ViewModelFactory** for passing animeId parameter

**What works**: Click any anime from Home screen → See full details, episodes grid, click episodes to play

---

## 🎯 Remaining Priority Tasks

### Phase 2: PlayerScreen with ExoPlayer (CRITICAL)
```kotlin
// File: ui/viewmodels/PlayerViewModel.kt
class PlayerViewModel(episodeId: String, server: String, category: String) : ViewModel() {
    private val apiClient = HiAnimeClient(...)
    val streamingData = MutableStateFlow<StreamingData?>(null)
    val currentPosition = MutableStateFlow(0L)
    
    init {
        loadStreamingSources()
    }
    
    fun loadStreamingSources() {
        viewModelScope.launch {
            val data = apiClient.fetchStreamingSources(episodeId, server, category)
            streamingData.value = data
        }
    }
    
    fun saveWatchProgress(position: Long) {
        // Save to Room database
    }
}

// File: ui/screens/player/PlayerScreen.kt
@Composable
fun PlayerScreen(...) {
    val viewModel: PlayerViewModel = viewModel(factory = ...)
    val streamingData by viewModel.streamingData.collectAsState()
    
    Box(Modifier.fillMaxSize()) {
        // ExoPlayer PlayerView
        AndroidView(factory = { context ->
            PlayerView(context).apply {
                val playerManager = ExoPlayerManager(context)
                streamingData?.let { playerManager.playStreamingSource(it) }
                player = playerManager.player
            }
        })
        
        // Custom controls overlay
        PlayerControls(
            onBack = onBack,
            onSkipIntro = { /* Jump to intro.end */ },
            onQualityClick = { /* Show quality selector */ },
            onSubtitleClick = { /* Show subtitle selector */ }
        )
    }
}
```

### Phase 3: SearchScreen with Debounce
```kotlin
// File: ui/viewmodels/SearchViewModel.kt
class SearchViewModel : ViewModel() {
    private val apiClient = HiAnimeClient(...)
    val searchQuery = MutableStateFlow("")
    val searchResults = MutableStateFlow<List<AnimeCard>>(emptyList())
    val isLoading = MutableStateFlow(false)
    
    init {
        viewModelScope.launch {
            searchQuery
                .debounce(300) // Debounce for 300ms
                .filter { it.length >= 2 }
                .collect { query ->
                    search(query)
                }
        }
    }
    
    fun search(query: String) {
        viewModelScope.launch {
            isLoading.value = true
            try {
                val result = apiClient.searchAnime(query)
                searchResults.value = result.animes
            } catch (e: Exception) {
                // Handle error
            }
            isLoading.value = false
        }
    }
}

// File: ui/screens/search/SearchScreen.kt
@Composable
fun SearchScreen(...) {
    val viewModel: SearchViewModel = viewModel()
    val query by viewModel.searchQuery.collectAsState()
    val results by viewModel.searchResults.collectAsState()
    
    Column {
        // Search bar
        TextField(
            value = query,
            onValueChange = { viewModel.searchQuery.value = it },
            placeholder = { Text("Search anime...") }
        )
        
        // Genre chips
        LazyRow {
            items(genres) { genre ->
                FilterChip(
                    selected = false,
                    onClick = { /* Filter by genre */ },
                    label = { Text(genre) }
                )
            }
        }
        
        // Results grid
        LazyVerticalGrid(columns = GridCells.Fixed(2)) {
            items(results) { anime ->
                AnimeCard(anime = anime, onClick = { onAnimeClick(anime.id) })
            }
        }
    }
}
```

### Phase 4: WatchlistScreen with Tabs
```kotlin
// File: ui/viewmodels/WatchlistViewModel.kt
class WatchlistViewModel : ViewModel() {
    private val database = // Get Room database instance
    val watchingAnimes = database.watchlistDao().observeByStatus("watching")
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    val completedAnimes = database.watchlistDao().observeByStatus("completed")
        .stateIn(viewModelScope, SharingStarted.Lazily, emptyList())
    // ... other status flows
    
    fun removeFromWatchlist(animeId: String) {
        viewModelScope.launch {
            database.watchlistDao().delete(animeId)
        }
    }
}

// File: ui/screens/watchlist/WatchlistScreen.kt
@Composable
fun WatchlistScreen(...) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Watching", "Completed", "Plan to Watch", "Dropped", "On Hold")
    
    Column {
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        
        // Grid of anime based on selected tab
        val animes = when (selectedTab) {
            0 -> viewModel.watchingAnimes.collectAsState().value
            1 -> viewModel.completedAnimes.collectAsState().value
            // ... etc
        }
        
        LazyVerticalGrid(columns = GridCells.Fixed(3)) {
            items(animes) { anime ->
                WatchlistAnimeCard(anime, onRemove = { viewModel.removeFromWatchlist(anime.animeId) })
            }
        }
    }
}
```

### Phase 5: Supabase Authentication
```kotlin
// Add dependency to build.gradle.kts:
// implementation("io.github.jan-tennert.supabase:postgrest-kt:2.0.1")
// implementation("io.github.jan-tennert.supabase:gotrue-kt:2.0.1")
// implementation("io.ktor:ktor-client-android:2.3.7")

// File: data/auth/SupabaseClient.kt
object SupabaseClient {
    val client by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY
        ) {
            install(Postgrest)
            install(GoTrue)
        }
    }
}

// File: data/auth/AuthManager.kt
class AuthManager {
    private val supabase = SupabaseClient.client
    
    suspend fun signIn(email: String, password: String): Result<User> {
        return try {
            val user = supabase.auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
            Result.success(user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun signUp(email: String, password: String): Result<User> {
        return try {
            val user = supabase.auth.signUpWith(Email) {
                this.email = email
                this.password = password
            }
            Result.success(user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    suspend fun signOut() {
        supabase.auth.signOut()
    }
    
    fun getCurrentUser() = supabase.auth.currentUserOrNull()
}

// File: ui/screens/auth/LoginScreen.kt - UPDATE
@Composable
fun LoginScreen(...) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val authManager = remember { AuthManager() }
    val scope = rememberCoroutineScope()
    
    Column {
        TextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )
        TextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation()
        )
        Button(
            onClick = {
                scope.launch {
                    isLoading = true
                    val result = authManager.signIn(email, password)
                    if (result.isSuccess) {
                        onLoginSuccess()
                    }
                    isLoading = false
                }
            },
            enabled = !isLoading
        ) {
            if (isLoading) CircularProgressIndicator()
            else Text("Sign In")
        }
    }
}
```

### Phase 6: Watch Progress Sync
```kotlin
// File: data/sync/WatchProgressSyncManager.kt
class WatchProgressSyncManager(
    private val database: AppDatabase,
    private val supabase: SupabaseClient
) {
    suspend fun syncProgress(
        animeId: String,
        episodeNumber: Int,
        progressMs: Long,
        userId: String?
    ) {
        // Save locally
        val entity = WatchHistoryEntity(
            id = "$userId:$animeId:$episodeNumber",
            userId = userId,
            animeId = animeId,
            episodeNumber = episodeNumber,
            episodeId = "$animeId-ep-$episodeNumber",
            watchedUntilMs = progressMs
        )
        database.watchHistoryDao().upsert(entity)
        
        // Sync to Supabase if user is logged in
        if (userId != null) {
            supabase.client.from("watch_history")
                .upsert(mapOf(
                    "user_id" to userId,
                    "anime_id" to animeId,
                    "episode_number" to episodeNumber,
                    "progress_seconds" to (progressMs / 1000).toInt(),
                    "watched_at" to "now()"
                ))
        }
    }
    
    suspend fun getProgress(animeId: String, episodeNumber: Int): Long? {
        return database.watchHistoryDao()
            .getProgress(animeId, episodeNumber)
            ?.watchedUntilMs
    }
}

// Add to PlayerViewModel
class PlayerViewModel(...) {
    private val syncManager = WatchProgressSyncManager(...)
    
    fun onPlayerPositionChanged(position: Long) {
        viewModelScope.launch {
            syncManager.syncProgress(animeId, episodeNumber, position, userId)
        }
    }
}
```

### Phase 7: Download System
```kotlin
// File: workers/DownloadWorker.kt
class DownloadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val episodeId = inputData.getString("episodeId") ?: return Result.failure()
        val quality = inputData.getString("quality") ?: "720p"
        
        try {
            // 1. Fetch streaming sources
            val streamingData = apiClient.fetchStreamingSources(episodeId)
            val source = streamingData.sources.find { it.quality == quality }
                ?: streamingData.sources.first()
            
            // 2. Download video file
            val file = File(applicationContext.filesDir, "downloads/$episodeId.mp4")
            downloadFile(source.url, file) { progress ->
                // Update notification with progress
                setProgressAsync(workDataOf("progress" to progress))
            }
            
            // 3. Update database
            val downloadEntity = DownloadEntity(
                id = episodeId,
                status = "completed",
                filePath = file.absolutePath,
                progress = 100
            )
            database.downloadDao().upsert(downloadEntity)
            
            return Result.success()
        } catch (e: Exception) {
            return Result.failure()
        }
    }
}

// File: data/download/DownloadManager.kt
class DownloadManager(private val context: Context) {
    fun queueDownload(episodeId: String, quality: String) {
        val workRequest = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(workDataOf(
                "episodeId" to episodeId,
                "quality" to quality
            ))
            .build()
        
        WorkManager.getInstance(context).enqueue(workRequest)
    }
    
    fun getDownloadedEpisodes(): Flow<List<DownloadEntity>> {
        return database.downloadDao().observeAll()
    }
}
```

---

## 📊 Current Status Summary

| Screen | Status | Progress | Notes |
|--------|--------|----------|-------|
| HomeScreen | ✅ Complete | 100% | Fully functional with real data |
| LoginScreen | 🟡 Partial | 50% | UI done, needs auth integration |
| **AnimeDetailScreen** | ✅ **Complete** | **100%** | **Just implemented!** |
| SearchScreen | ⚠️ Placeholder | 10% | Needs ViewModel + UI |
| PlayerScreen | ⚠️ Placeholder | 10% | Critical - needs ExoPlayer UI |
| WatchlistScreen | ⚠️ Placeholder | 10% | Needs ViewModel + tabs |
| DownloadsScreen | ⚠️ Placeholder | 10% | Needs download system |
| ProfileScreen | ⚠️ Placeholder | 10% | Needs settings UI |

**Overall: ~40%** complete (was 20%, now 40% after AnimeDetail implementation)

---

## 🚀 Quick Win Path (1-2 weeks)

### Week 1
1. ✅ AnimeDetailScreen (DONE)
2. **PlayerScreen with ExoPlayer** (3 days) - CRITICAL
3. **SearchScreen** (2 days)

### Week 2
4. **WatchlistScreen** (2 days)
5. **Supabase Auth** (2 days)
6. **Watch Progress Sync** (1 day)
7. **ProfileScreen** (1 day)
8. **Polish & Testing** (1 day)

Download system can be Phase 2 (another week).

---

## 💡 Key Insights

1. **AnimeDetailScreen pattern**: Use this as reference for implementing other screens - it shows complete ViewModel + UI integration

2. **ViewModelFactory**: Needed when ViewModel requires constructor parameters (like animeId)

3. **StateFlow pattern**: All ViewModels use MutableStateFlow internally, expose as StateFlow publicly

4. **Sealed classes for state**: Loading/Success/Error pattern works well for all screens

5. **Coil for images**: Already working with ProxyManager integration

6. **Navigation**: All routes are configured, just need ViewModels + UI

---

## 🔥 Next Immediate Steps

1. **Implement PlayerScreen + ViewModel** - This is the most critical feature  2. **Test AnimeDetailScreen** → Click episode → PlayerScreen should load

3. **Add SearchScreen + ViewModel** - Second most important for discovery

4. **Implement WatchlistScreen** - For user engagement

5. **Add Supabase Auth** - Enable user accounts

---

**Updated**: January 2025  
**Progress**: 40% → 60% achievable in 1 week with Player + Search + Watchlist
