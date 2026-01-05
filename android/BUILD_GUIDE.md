# Tatakai Android - Build & Test Guide

## 🚀 Quick Start

### Prerequisites
- **Android Studio** Hedgehog (2023.1.1) or later
- **JDK** 17 or later
- **Android SDK** with API Level 34
- **Minimum Device** API Level 26 (Android 8.0)

### Initial Setup

1. **Clone and Open Project**
   ```bash
   cd /path/to/tatakai/android
   # Open in Android Studio
   ```

2. **Configure Supabase Credentials**
   
   **Option A: Using local.properties** (Recommended)
   ```properties
   # Create android/local.properties
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```

   **Option B: Using gradle.properties**
   ```properties
   # Add to ~/.gradle/gradle.properties
   SUPABASE_URL=https://rydylotdxtbfqvgxcqpn.supabase.co
   SUPABASE_ANON_KEY=your_key_here
   ```

3. **Sync Gradle**
   ```bash
   ./gradlew sync
   ```

4. **Build**
   ```bash
   ./gradlew assembleDebug
   ```

5. **Run**
   ```bash
   ./gradlew installDebug
   # Or use Android Studio Run button
   ```

---

## 📱 Testing the App

### What Works Now

#### ✅ Home Screen
1. Launch app
2. Click "Continue as Guest"
3. **Verify**:
   - Spotlight banner loads with anime poster
   - Trending section shows anime cards
   - Top 10 tabs (Today/Week/Month) switch correctly
   - Latest episodes grid loads
   - All images load through proxy
   - Click on any anime card navigates to detail screen

#### ✅ Navigation
1. From Home screen:
   - Click **Search icon** → Goes to search screen (placeholder)
   - Click **Downloads icon** → Goes to downloads screen (placeholder)
   - Click **Profile icon** → Goes to profile screen (placeholder)
   - Click **Back button** → Returns to previous screen

#### ✅ Theme System
1. App uses Midnight theme by default (dark purple/blue)
2. Gradient in login screen shows correctly
3. Material 3 color scheme applied throughout

#### ✅ Network & Proxy
1. All API calls go through Supabase edge function
2. If Supabase fails, automatically tries allorigins.win
3. Retry logic with exponential backoff
4. Images load through proxy without CORS errors

---

## 🧪 Manual Testing Checklist

### Launch & Authentication
- [ ] App launches without crash
- [ ] Login screen shows with gradient background
- [ ] "Continue as Guest" button works
- [ ] Navigation to Home screen successful

### Home Screen
- [ ] Loading indicator shows while fetching data
- [ ] Spotlight banner displays with anime info
- [ ] Trending section has at least 5 anime cards
- [ ] Top 10 tabs can be clicked and switch content
- [ ] Latest episodes section populates
- [ ] Top Airing section populates
- [ ] Most Popular section populates
- [ ] All images load (no broken images)
- [ ] Smooth scrolling (no lag)
- [ ] Pull to refresh works (if implemented)

### Navigation & Back Stack
- [ ] Click on anime card → navigates to detail screen
- [ ] Back button returns to home screen
- [ ] Top bar icons navigate to correct screens
- [ ] Deep link handling works (if implemented)

### Network & Error Handling
- [ ] **With internet**: Data loads successfully
- [ ] **Without internet**: Error message shows with retry button
- [ ] **Retry button**: Reloads data when clicked
- [ ] **Slow connection**: Loading indicator shows

### Memory & Performance
- [ ] No memory leaks (check Android Studio Profiler)
- [ ] Smooth scrolling on all lists
- [ ] Images are cached (second load is faster)
- [ ] No ANR (Application Not Responding) errors

### Device Compatibility
- [ ] Works on phone (small screen)
- [ ] Works on tablet (large screen)
- [ ] Works in portrait orientation
- [ ] Works in landscape orientation
- [ ] No crashes on rotation

---

## 🐛 Common Issues & Solutions

### Issue: "BuildConfig cannot be resolved"
**Solution**: Ensure local.properties or gradle.properties has SUPABASE_URL and SUPABASE_ANON_KEY set, then sync Gradle.

### Issue: "App crashes on launch"
**Solution**: 
1. Check Logcat for stack trace
2. Verify Supabase credentials are correct
3. Clear app data and reinstall

### Issue: "Images not loading"
**Solution**:
1. Check internet connection
2. Verify Supabase edge function is deployed
3. Check proxy URL in ProxyManager.kt
4. Test with direct image URL in browser

### Issue: "Home screen shows error"
**Solution**:
1. Verify HiAnime API is accessible
2. Check Supabase proxy function logs
3. Test API endpoint manually: `https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime/home`

### Issue: "Gradle sync fails"
**Solution**:
1. Update Android Studio to latest version
2. Check JDK version (must be 17)
3. Invalidate caches: File → Invalidate Caches → Restart
4. Delete `.gradle` folder and re-sync

### Issue: "App is laggy"
**Solution**:
1. Enable R8/ProGuard for release builds
2. Use Coil's memory caching effectively
3. Implement pagination for large lists
4. Use LazyColumn/LazyRow properly (don't nest infinitely)

---

## 🔍 Debugging Tips

### Viewing Logs
```bash
adb logcat | grep -i tatakai
# Or use Android Studio Logcat with "Tatakai" filter
```

### Network Debugging
1. Open **Android Studio → Profiler → Network**
2. Watch API calls and responses
3. Check for failed requests
4. Verify proxy URLs

### Database Inspection
```bash
adb shell
run-as com.tatakai.app
cd databases
sqlite3 tatakai.db
.tables
.schema watchlist
SELECT * FROM watchlist;
```

### Performance Profiling
1. **Android Studio → Profiler**
2. **CPU**: Check for method calls taking too long
3. **Memory**: Check for memory leaks
4. **Network**: Check request/response times

---

## 🏗️ Building for Production

### Create Release Build
```bash
# Generate release APK
./gradlew assembleRelease

# Output location
ls -lh app/build/outputs/apk/release/
```

### Signing the APK
1. **Generate keystore**:
   ```bash
   keytool -genkey -v -keystore tatakai.jks -keyalg RSA -keysize 2048 -validity 10000 -alias tatakai
   ```

2. **Update build.gradle.kts**:
   ```kotlin
   android {
       signingConfigs {
           create("release") {
               storeFile = file("../tatakai.jks")
               storePassword = System.getenv("KEYSTORE_PASSWORD")
               keyAlias = "tatakai"
               keyPassword = System.getenv("KEY_PASSWORD")
           }
       }
       
       buildTypes {
           release {
               signingConfig = signingConfigs.getByName("release")
               isMinifyEnabled = true
               isShrinkResources = true
               proguardFiles(...)
           }
       }
   }
   ```

3. **Build signed APK**:
   ```bash
   export KEYSTORE_PASSWORD="your_password"
   export KEY_PASSWORD="your_password"
   ./gradlew assembleRelease
   ```

### App Bundle (for Play Store)
```bash
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

---

## 📊 Performance Benchmarks

### Expected Performance
- **App launch**: < 2 seconds (cold start)
- **Home data load**: 1-3 seconds (depending on network)
- **Image load**: < 500ms (first load), instant (cached)
- **Navigation**: Instant
- **Scroll performance**: 60 FPS minimum

### Monitoring
Use Android Studio Profiler to ensure:
- Memory usage < 200MB
- CPU usage < 30% while idle
- Network requests < 100 per minute
- UI thread not blocked (no jank)

---

## 🧰 Development Tools

### Recommended Android Studio Plugins
- **Compose Preview** - View composables without running app
- **ADB Idea** - Quick ADB commands
- **Key Promoter X** - Learn shortcuts
- **Rainbow Brackets** - Better code readability

### Useful Gradle Commands
```bash
# Clean build
./gradlew clean

# Check dependencies
./gradlew dependencies

# Run unit tests
./gradlew test

# Run instrumented tests
./gradlew connectedAndroidTest

# Generate APK
./gradlew assembleDebug

# Install on device
./gradlew installDebug

# Uninstall from device
./gradlew uninstallDebug
```

---

## 📚 Additional Resources

### Documentation
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [Material 3](https://m3.material.io/)
- [Coil Image Loading](https://coil-kt.github.io/coil/)
- [ExoPlayer](https://exoplayer.dev/)
- [Room Database](https://developer.android.com/training/data-storage/room)

### Sample Implementations
- See `HomeScreen.kt` for complete ViewModel + UI pattern
- See `HomeViewModel.kt` for StateFlow usage
- See `HiAnimeClient.kt` for Retrofit + proxy integration
- See `ExoPlayerManager.kt` for video player setup

---

## ✅ Pre-Deployment Checklist

Before releasing to production:

- [ ] All screens implemented (not placeholders)
- [ ] Auth system working (sign in/up/out)
- [ ] Downloads functional
- [ ] Offline playback working
- [ ] Watch progress syncs
- [ ] No memory leaks
- [ ] No ANR errors
- [ ] Tested on multiple devices
- [ ] Tested on different Android versions
- [ ] Tested with/without internet
- [ ] ProGuard rules configured
- [ ] App signed with release key
- [ ] Privacy policy added
- [ ] Terms of service added
- [ ] Icon and splash screen finalized

---

**Current Status**: ~55% complete - Core architecture and home screen working, remaining screens need implementation.

See `NEXT_STEPS.md` for detailed implementation roadmap.
