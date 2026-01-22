# Tatakai Mobile - API Integration Guide

Complete guide for integrating with HiAnime API, Supabase, and other external services.

## 🌐 API Overview

### Primary APIs
1. **HiAnime API**: Anime data and streaming sources
2. **Supabase**: Authentication, database, storage, edge functions
3. **Firebase**: Push notifications, analytics, crash reporting
4. **Consumet**: Alternative anime data source
5. **AniSkip**: Intro/outro skip timestamps
6. **WatchAnimeWorld**: Additional streaming sources

## 📡 HiAnime API Integration

### Base Configuration

```dart
// lib/config/env.dart
static const String apiBaseUrl = 
    'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';
static const String proxyUrl = 
    'https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/rapid-service';
```

### Endpoints

#### 1. Home Data
```dart
GET /home

Response: {
  "genres": ["Action", "Adventure", ...],
  "spotlightAnimes": [...],
  "trendingAnimes": [...],
  "latestEpisodeAnimes": [...],
  "topAiringAnimes": [...],
  "mostPopularAnimes": [...],
  "mostFavoriteAnimes": [...],
  "latestCompletedAnimes": [...]
}
```

#### 2. Anime Info
```dart
GET /anime/:animeId

Response: {
  "anime": {
    "info": {
      "id": "one-piece-100",
      "name": "One Piece",
      "poster": "https://...",
      "description": "...",
      "stats": {
        "rating": "8.7",
        "quality": "HD",
        "episodes": {"sub": 1000, "dub": 950},
        "type": "TV",
        "duration": "24 min/ep"
      }
    },
    "moreInfo": {
      "aired": "Oct 20, 1999",
      "genres": ["Action", "Adventure"],
      "status": "Ongoing",
      "studios": "Toei Animation"
    }
  },
  "recommendedAnimes": [...],
  "relatedAnimes": [...]
}
```

#### 3. Episodes List
```dart
GET /anime/:animeId/episodes

Response: {
  "totalEpisodes": 1000,
  "episodes": [
    {
      "number": 1,
      "title": "Episode Title",
      "episodeId": "one-piece-100$episode$1",
      "isFiller": false
    }
  ]
}
```

#### 4. Episode Servers
```dart
GET /episode/servers?animeEpisodeId=:episodeId

Response: {
  "episodeId": "one-piece-100$episode$1",
  "episodeNo": 1,
  "sub": [
    {"serverId": 1, "serverName": "HD-1"},
    {"serverId": 4, "serverName": "HD-2"}
  ],
  "dub": [...],
  "raw": [...]
}
```

#### 5. Streaming Sources
```dart
GET /episode/sources?animeEpisodeId=:episodeId&server=hd-1&category=sub

Response: {
  "headers": {
    "Referer": "https://...",
    "User-Agent": "Mozilla/5.0..."
  },
  "sources": [
    {
      "url": "https://.../master.m3u8",
      "isM3U8": true,
      "quality": "1080p"
    }
  ],
  "subtitles": [
    {
      "lang": "English",
      "url": "https://.../en.vtt"
    }
  ],
  "anilistID": 21,
  "malID": 21,
  "intro": {"start": 90, "end": 120},
  "outro": {"start": 1320, "end": 1410}
}
```

#### 6. Search
```dart
GET /search?q=:query&page=:page

Response: {
  "animes": [...],
  "mostPopularAnimes": [...],
  "currentPage": 1,
  "totalPages": 10,
  "hasNextPage": true,
  "searchQuery": "naruto"
}
```

#### 7. Genre Animes
```dart
GET /genre/:genre?page=:page

Response: {
  "genreName": "Action",
  "animes": [...],
  "currentPage": 1,
  "totalPages": 20,
  "hasNextPage": true
}
```

### API Service Implementation

```dart
// lib/services/api_service.dart
class ApiService {
  final Dio _dio;
  final Dio _proxyDio;
  
  Future<T> _retryRequest<T>(
    Future<T> Function() request,
    {int maxRetries = 3}
  ) async {
    int attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await request();
      } catch (e) {
        attempt++;
        if (attempt >= maxRetries) rethrow;
        await Future.delayed(
          Duration(milliseconds: 300 * (1 << attempt))
        );
      }
    }
    throw Exception('Max retries exceeded');
  }
  
  Future<HomeData> fetchHome() async {
    return _retryRequest(() async {
      try {
        // Try via Supabase proxy first
        final response = await _proxyGet('$apiBaseUrl/home');
        return HomeData.fromJson(response.data);
      } catch (e) {
        // Fallback to direct request
        final response = await _dio.get('/home');
        return HomeData.fromJson(response.data);
      }
    });
  }
}
```

### Video Proxy Implementation

```dart
String getProxiedVideoUrl(String videoUrl, {String? referer}) {
  // Avoid double-proxying
  if (videoUrl.contains('/functions/v1/rapid-service')) {
    return videoUrl;
  }
  
  final params = {
    'url': videoUrl,
    'type': 'video',
    if (referer != null) 'referer': referer,
    'apikey': Config.supabaseAnonKey,
  };
  
  return '$proxyUrl?${Uri(queryParameters: params).query}';
}
```

## 🔐 Supabase Integration

### Setup

```dart
// Initialize in main.dart
await Supabase.initialize(
  url: Config.supabaseUrl,
  anonKey: Config.supabaseAnonKey,
);

final supabase = Supabase.instance.client;
```

### Authentication

#### Sign Up
```dart
final response = await supabase.auth.signUp(
  email: email,
  password: password,
  data: {'username': username},
);

// Create profile
await supabase.from('profiles').insert({
  'id': response.user!.id,
  'email': email,
  'username': username,
  'role': 'user',
});
```

#### Sign In
```dart
final response = await supabase.auth.signInWithPassword(
  email: email,
  password: password,
);
```

#### OAuth Sign In
```dart
await supabase.auth.signInWithOAuth(
  Provider.google,
  redirectTo: 'tatakai://callback',
);
```

#### Sign Out
```dart
await supabase.auth.signOut();
```

### Database Operations

#### Watch History
```dart
// Save watch history
await supabase.from('watch_history').upsert({
  'user_id': userId,
  'anime_id': animeId,
  'episode_id': episodeId,
  'episode_number': episodeNumber,
  'progress': progressSeconds,
  'duration': durationSeconds,
  'updated_at': DateTime.now().toIso8601String(),
}, onConflict: 'user_id,anime_id,episode_id');

// Get watch history
final history = await supabase
    .from('watch_history')
    .select()
    .eq('user_id', userId)
    .order('updated_at', ascending: false)
    .limit(50);
```

#### Favorites
```dart
// Add to favorites
await supabase.from('favorites').insert({
  'user_id': userId,
  'anime_id': animeId,
  'anime_name': animeName,
  'anime_poster': animePoster,
});

// Remove from favorites
await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('anime_id', animeId);

// Check if favorite
final result = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('anime_id', animeId)
    .maybeSingle();

final isFavorite = result != null;
```

#### User Preferences
```dart
// Save preferences
await supabase
    .from('profiles')
    .update({
      'preferences': preferences.toJson(),
      'updated_at': DateTime.now().toIso8601String(),
    })
    .eq('id', userId);

// Get preferences
final profile = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single();

final prefs = UserPreferences.fromJson(profile['preferences']);
```

### Real-time Subscriptions

```dart
// Subscribe to watch history changes
final subscription = supabase
    .channel('watch_history:$userId')
    .onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'watch_history',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: userId,
      ),
      callback: (payload) {
        // Handle change
        if (payload.newRecord != null) {
          final history = WatchHistory.fromJson(payload.newRecord!);
          // Update UI
        }
      },
    )
    .subscribe();

// Unsubscribe when done
await subscription.unsubscribe();
```

### Edge Functions

#### Rapid Service Proxy
```dart
// GET request
final response = await supabase.functions.invoke(
  'rapid-service',
  method: HttpMethod.get,
  queryParameters: {
    'url': targetUrl,
    'type': 'video', // or 'api', 'image'
    'referer': refererUrl,
  },
);

// Response contains proxied content
final data = response.data;
```

#### WatchAnimeWorld Scraper
```dart
final response = await supabase.functions.invoke(
  'watchanimeworld-scraper',
  method: HttpMethod.get,
  queryParameters: {
    'episodeUrl': wawEpisodeUrl,
  },
);

final streamingData = StreamingData.fromJson(response.data);
```

### Storage (Profile Pictures)

```dart
// Upload profile picture
final file = File(imagePath);
final fileName = '${userId}_${DateTime.now().millisecondsSinceEpoch}.jpg';

await supabase.storage
    .from('avatars')
    .upload(fileName, file);

// Get public URL
final publicUrl = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

// Update profile
await supabase
    .from('profiles')
    .update({'avatar_url': publicUrl})
    .eq('id', userId);

// Delete old avatar
await supabase.storage
    .from('avatars')
    .remove([oldFileName]);
```

## 🔔 Firebase Integration

### Cloud Messaging

#### Initialize
```dart
// main.dart
await Firebase.initializeApp();
final fcm = FirebaseMessaging.instance;

// Request permission
await fcm.requestPermission(
  alert: true,
  badge: true,
  sound: true,
);

// Get FCM token
final token = await fcm.getToken();

// Save token to Supabase
await supabase
    .from('fcm_tokens')
    .upsert({
      'user_id': userId,
      'token': token,
      'platform': Platform.isIOS ? 'ios' : 'android',
    });
```

#### Subscribe to Topics
```dart
await fcm.subscribeToTopic('all_users');
await fcm.subscribeToTopic('anime_updates');
await fcm.subscribeToTopic('maintenance_alerts');
```

#### Handle Messages

```dart
// Foreground messages
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  // Show local notification
  showLocalNotification(
    title: message.notification?.title ?? 'Tatakai',
    body: message.notification?.body ?? '',
  );
});

// Background message tap
FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  // Navigate to screen
  final screen = message.data['screen'];
  final params = message.data['params'];
  context.push('/$screen', extra: params);
});

// Terminated state
final initialMessage = await fcm.getInitialMessage();
if (initialMessage != null) {
  // Handle navigation
}
```

### Analytics

```dart
import 'package:firebase_analytics/firebase_analytics.dart';

final analytics = FirebaseAnalytics.instance;

// Log events
await analytics.logEvent(
  name: 'watch_episode',
  parameters: {
    'anime_id': animeId,
    'episode_number': episodeNumber,
    'source': 'hd-1',
  },
);

// Log screen view
await analytics.logScreenView(
  screenName: 'AnimeDetail',
  screenClass: 'AnimeDetailScreen',
);

// Set user properties
await analytics.setUserId(id: userId);
await analytics.setUserProperty(
  name: 'favorite_genre',
  value: 'Action',
);
```

### Crashlytics

```dart
import 'package:firebase_crashlytics/firebase_crashlytics.dart';

// Initialize
FlutterError.onError = 
    FirebaseCrashlytics.instance.recordFlutterError;

// Log errors
try {
  // Code that might throw
} catch (e, stack) {
  await FirebaseCrashlytics.instance.recordError(
    e,
    stack,
    reason: 'Error fetching anime data',
  );
}

// Log custom messages
await FirebaseCrashlytics.instance.log('Fetching episode sources');

// Set custom keys
await FirebaseCrashlytics.instance.setCustomKey('anime_id', animeId);
await FirebaseCrashlytics.instance.setCustomKey('user_id', userId);
```

## 🎬 AniSkip Integration

### Fetch Skip Times

```dart
Future<SkipTimes?> fetchSkipTimes(int malId, int episodeNumber) async {
  try {
    final response = await dio.get(
      'https://api.aniskip.com/v2/skip-times/$malId/$episodeNumber',
      queryParameters: {
        'types': ['op', 'ed'], // opening, ending
        'episodeLength': episodeDuration,
      },
    );
    
    final results = response.data['results'] as List;
    SkipTimes? skipTimes;
    
    for (final result in results) {
      if (result['skipType'] == 'op') {
        skipTimes.intro = SkipTime(
          start: result['interval']['startTime'].toInt(),
          end: result['interval']['endTime'].toInt(),
        );
      } else if (result['skipType'] == 'ed') {
        skipTimes.outro = SkipTime(
          start: result['interval']['startTime'].toInt(),
          end: result['interval']['endTime'].toInt(),
        );
      }
    }
    
    return skipTimes;
  } catch (e) {
    return null; // Skip times not available
  }
}
```

### Use in Video Player

```dart
// Check if skip should be shown
if (_currentPosition >= intro.start && 
    _currentPosition <= intro.end &&
    !_introskipped) {
  setState(() => _showSkipIntroButton = true);
}

// Handle skip button tap
void _skipIntro() {
  _videoController.seekTo(Duration(seconds: intro.end));
  setState(() {
    _introskipped = true;
    _showSkipIntroButton = false;
  });
}

// Auto-skip if enabled
if (userPreferences.autoSkipIntro && !_introskipped) {
  _videoController.seekTo(Duration(seconds: intro.end));
  _introskipped = true;
}
```

## 🌐 WatchAnimeWorld Integration

### Scrape Episode Sources

```dart
Future<StreamingData> fetchWAWSources(String episodeUrl) async {
  final response = await supabase.functions.invoke(
    'watchanimeworld-scraper',
    method: HttpMethod.get,
    queryParameters: {'episodeUrl': episodeUrl},
  );
  
  return StreamingData.fromJson(response.data);
}
```

### Fallback Chain

```dart
Future<StreamingData> getStreamingSourcesWithFallback(
  String episodeId,
) async {
  // Try primary source (HiAnime)
  try {
    return await fetchStreamingSources(episodeId);
  } catch (e) {
    print('Primary source failed: $e');
  }
  
  // Try WatchAnimeWorld
  try {
    final wawUrl = await _findWAWUrl(episodeId);
    if (wawUrl != null) {
      return await fetchWAWSources(wawUrl);
    }
  } catch (e) {
    print('WAW source failed: $e');
  }
  
  // Try Consumet
  try {
    return await fetchConsumetSources(episodeId);
  } catch (e) {
    print('Consumet source failed: $e');
  }
  
  throw Exception('No streaming sources available');
}
```

## 🔍 Error Handling

### API Error Handling

```dart
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic data;
  
  ApiException(this.message, {this.statusCode, this.data});
  
  @override
  String toString() => 'ApiException: $message';
}

Future<T> handleApiCall<T>(Future<T> Function() call) async {
  try {
    return await call();
  } on DioException catch (e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        throw ApiException('Connection timeout');
      case DioExceptionType.badResponse:
        throw ApiException(
          'Server error: ${e.response?.statusCode}',
          statusCode: e.response?.statusCode,
          data: e.response?.data,
        );
      case DioExceptionType.cancel:
        throw ApiException('Request cancelled');
      default:
        throw ApiException('Network error: ${e.message}');
    }
  } catch (e) {
    throw ApiException('Unexpected error: $e');
  }
}
```

### Retry Logic

```dart
Future<T> retryApiCall<T>({
  required Future<T> Function() call,
  int maxRetries = 3,
  Duration initialDelay = const Duration(seconds: 1),
}) async {
  int attempt = 0;
  Duration delay = initialDelay;
  
  while (attempt < maxRetries) {
    try {
      return await call();
    } catch (e) {
      attempt++;
      if (attempt >= maxRetries) rethrow;
      
      await Future.delayed(delay);
      delay *= 2; // Exponential backoff
    }
  }
  
  throw Exception('Max retries exceeded');
}
```

## 📊 Rate Limiting

### Implement Rate Limiter

```dart
class RateLimiter {
  final Map<String, DateTime> _lastCallTime = {};
  final Duration minDelay;
  
  RateLimiter({this.minDelay = const Duration(milliseconds: 100)});
  
  Future<T> execute<T>(String key, Future<T> Function() call) async {
    final now = DateTime.now();
    final lastCall = _lastCallTime[key];
    
    if (lastCall != null) {
      final elapsed = now.difference(lastCall);
      if (elapsed < minDelay) {
        await Future.delayed(minDelay - elapsed);
      }
    }
    
    _lastCallTime[key] = DateTime.now();
    return await call();
  }
}

// Usage
final rateLimiter = RateLimiter(minDelay: Duration(milliseconds: 500));

final result = await rateLimiter.execute(
  'fetch_anime',
  () => api.fetchAnimeInfo(animeId),
);
```

---

For more details, see `/lib/services/` directory for complete implementations.
