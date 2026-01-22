# Tatakai Mobile - Deployment Guide

Complete guide for deploying Tatakai mobile app to Google Play Store and Apple App Store.

## 📋 Pre-Deployment Checklist

- [ ] All features tested and working
- [ ] No console errors or warnings
- [ ] Performance optimized (60 FPS)
- [ ] Assets compressed and optimized
- [ ] API keys properly configured
- [ ] Firebase setup complete
- [ ] Supabase integration verified
- [ ] Privacy policy and terms of service ready
- [ ] App icons and splash screens created
- [ ] Version number incremented

## 🍎 iOS Deployment (App Store)

### Prerequisites
- Apple Developer Account ($99/year)
- macOS with Xcode 14+
- Valid code signing certificates

### Step 1: Configure App Identifiers

1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Create App ID: `com.tatakai.mobile`
3. Enable capabilities:
   - Push Notifications
   - Associated Domains (for deep linking)
   - Background Modes (audio, fetch, remote-notification)

### Step 2: Create Provisioning Profiles

```bash
# In Xcode, go to:
# Preferences → Accounts → Download Manual Profiles
```

### Step 3: Configure Info.plist

Update `ios/Runner/Info.plist`:

```xml
<key>CFBundleDisplayName</key>
<string>Tatakai</string>

<key>CFBundleShortVersionString</key>
<string>1.0.0</string>

<key>CFBundleVersion</key>
<string>1</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Tatakai needs access to save downloaded episodes</string>

<key>NSCameraUsageDescription</key>
<string>Tatakai needs camera access for profile pictures</string>

<key>NSMicrophoneUsageDescription</key>
<string>Tatakai needs microphone access for voice interactions</string>
```

### Step 4: Build and Archive

```bash
# Clean build
flutter clean
cd ios
pod install
pod update
cd ..

# Build iOS release
flutter build ios --release

# Open in Xcode
open ios/Runner.xcworkspace
```

In Xcode:
1. Select "Generic iOS Device" as target
2. Product → Archive
3. Wait for archive to complete
4. Window → Organizer → Select archive → Distribute App

### Step 5: Upload to App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create new app
3. Fill in metadata:
   - App Name: Tatakai
   - Subtitle: Anime Streaming Platform
   - Category: Entertainment
   - Keywords: anime, streaming, manga, otaku
   - Description: (See marketing copy below)
   - Screenshots: Prepare for all device sizes
   - Privacy Policy URL
   - Support URL

4. Upload build from Xcode
5. Submit for review

### iOS Review Checklist
- [ ] Clear app description
- [ ] Accurate screenshots
- [ ] Demo account (if login required)
- [ ] Content rating questionnaire
- [ ] Export compliance information
- [ ] Age rating: 12+ (anime content)

## 🤖 Android Deployment (Google Play)

### Prerequisites
- Google Play Developer Account ($25 one-time)
- Android Studio
- Keystore for signing

### Step 1: Create Keystore

```bash
keytool -genkey -v -keystore ~/tatakai-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias tatakai

# Save keystore password securely!
```

### Step 2: Configure Signing

Create `android/key.properties`:

```properties
storePassword=<password-from-previous-step>
keyPassword=<password-from-previous-step>
keyAlias=tatakai
storeFile=<location-of-keystore-file>
```

Update `android/app/build.gradle`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
        }
    }
}
```

### Step 3: Build APK/Bundle

```bash
# Clean build
flutter clean
flutter pub get

# Build App Bundle (recommended for Play Store)
flutter build appbundle --release

# Or build APK
flutter build apk --release --split-per-abi

# Outputs:
# build/app/outputs/bundle/release/app-release.aab
# build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk
# build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
# build/app/outputs/flutter-apk/app-x86_64-release.apk
```

### Step 4: Upload to Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app
3. Fill in Store listing:
   - App name: Tatakai
   - Short description: (50 chars)
   - Full description: (See marketing copy below)
   - App icon: 512x512 PNG
   - Feature graphic: 1024x500 PNG
   - Screenshots: Multiple device types
   - App category: Entertainment
   - Content rating: Everyone, Teen (with anime content)
   - Privacy policy URL

4. Create release:
   - Production → Create release
   - Upload AAB file
   - Release name: 1.0.0
   - Release notes: "Initial release"

5. Set pricing: Free

6. Select countries: Worldwide (or specific regions)

7. Submit for review

### Android Review Checklist
- [ ] App content rating questionnaire
- [ ] Target audience (Teen/Adult)
- [ ] Privacy policy
- [ ] Data safety section
- [ ] App signing by Google Play (recommended)

## 📱 App Metadata

### App Name
**Tatakai** - Anime Streaming Platform

### Short Description (80 chars)
Watch anime with multi-source streaming, downloads, and cross-device sync.

### Long Description

```
Tatakai is the ultimate anime streaming app with a beautiful, pixel-perfect design and powerful features for anime fans.

KEY FEATURES:
✨ Multi-source streaming with auto-fallback
📥 Download episodes for offline viewing
☁️ Cloud sync across all your devices
🔔 Notifications for new episode releases
🎨 15+ stunning themes (dark/light modes)
📱 Intuitive, modern UI design
⚡ Fast loading and smooth playback
🎯 Smart resume and watch history
❤️ Favorites and custom playlists
🏆 Create and share tier lists
💬 Community ratings and reviews
🔍 Powerful search and filtering
📊 Track your watch statistics

STREAMING FEATURES:
• HLS streaming with quality selection
• Auto-skip intro/outro
• Multiple subtitle options
• Playback speed control
• Picture-in-Picture mode
• Chromecast support (coming soon)

DOWNLOAD & OFFLINE:
• Download individual episodes or full seasons
• Choose quality (480p, 720p, 1080p)
• Resume interrupted downloads
• Manage storage easily

SYNCHRONIZATION:
• Real-time sync across devices
• Continue watching anywhere
• Favorites synced instantly
• Settings synced automatically

PERSONALIZATION:
• Choose from 15+ beautiful themes
• Customize subtitle appearance
• Set video quality preferences
• Configure notifications

Perfect for anime lovers who want a premium streaming experience with powerful features and beautiful design.

Note: Tatakai aggregates content from multiple public sources. We do not host any content.

Privacy Policy: https://tatakai.gabhasti.tech/privacy
Terms of Service: https://tatakai.gabhasti.tech/terms
```

### Keywords

**iOS:**
anime, streaming, manga, otaku, watch, episodes, download, offline, japanese, animation

**Android:**
anime streaming, watch anime, anime app, manga, otaku, anime episodes, download anime, offline anime, japanese animation, anime player

## 📸 Screenshots Requirements

### iOS
- 6.5" Display (iPhone 14 Pro Max): 1284 x 2778
- 5.5" Display (iPhone 8 Plus): 1242 x 2208
- 12.9" iPad Pro: 2048 x 2732

### Android
- Phone: 1080 x 1920 (minimum 2 images)
- 7" Tablet: 1024 x 600
- 10" Tablet: 1280 x 800

### Screenshot Content Suggestions:
1. Home screen with featured carousel
2. Anime detail page
3. Video player in action
4. Search results
5. Downloads screen
6. Profile with tier lists
7. Settings with themes
8. Community features

## 🎨 App Icons

### iOS
Use Xcode Asset Catalog with icons for:
- 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt at @1x, @2x, @3x
- App Store: 1024x1024 (without transparency)

### Android
Place in `android/app/src/main/res/`:
- mipmap-mdpi: 48x48
- mipmap-hdpi: 72x72
- mipmap-xhdpi: 96x96
- mipmap-xxhdpi: 144x144
- mipmap-xxxhdpi: 192x192

Use `flutter_launcher_icons` package to generate:

```yaml
# pubspec.yaml
dev_dependencies:
  flutter_launcher_icons: ^0.13.1

flutter_launcher_icons:
  android: true
  ios: true
  image_path: "assets/images/logo.png"
  adaptive_icon_background: "#0F0F0F"
  adaptive_icon_foreground: "assets/images/logo_foreground.png"
```

```bash
flutter pub run flutter_launcher_icons
```

## 🔄 Version Management

### Semantic Versioning
Format: `MAJOR.MINOR.PATCH+BUILD`

- **MAJOR**: Breaking changes (2.0.0)
- **MINOR**: New features (1.1.0)
- **PATCH**: Bug fixes (1.0.1)
- **BUILD**: Build number (auto-increment)

Update in `pubspec.yaml`:
```yaml
version: 1.0.0+1
```

### iOS Build Number
Update in Xcode or `ios/Runner/Info.plist`:
```xml
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>
<key>CFBundleVersion</key>
<string>1</string>
```

### Android Version
Update in `android/app/build.gradle`:
```gradle
defaultConfig {
    versionCode 1
    versionName "1.0.0"
}
```

## 🚀 Release Process

### 1. Pre-Release Testing
```bash
# Run all tests
flutter test

# Test on real devices
flutter run --release

# Profile performance
flutter run --profile
flutter drive --profile
```

### 2. Build Release
```bash
# iOS
flutter build ios --release --no-codesign

# Android
flutter build appbundle --release
```

### 3. Submit for Review
- iOS: 1-2 days review time
- Android: 1-3 days review time

### 4. Monitor Crash Reports
- iOS: Xcode Organizer → Crashes
- Android: Play Console → Quality → Android vitals

## 📊 Post-Launch Monitoring

### App Store Connect
- Sales and trends
- App Analytics
- Crash reports
- Ratings and reviews

### Google Play Console
- Statistics
- Android vitals
- Crashes & ANRs
- User reviews

### Crashlytics
```dart
// lib/main.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await Firebase.initializeApp();
  
  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterError;
  
  runApp(const TatakaiApp());
}
```

## 🔧 Continuous Deployment

### Using Fastlane

Install Fastlane:
```bash
# iOS
cd ios
fastlane init
cd ..

# Android
cd android
fastlane init
cd ..
```

Create `Fastfile`:
```ruby
# iOS Fastfile
lane :beta do
  build_app(scheme: "Runner")
  upload_to_testflight
end

lane :release do
  build_app(scheme: "Runner")
  upload_to_app_store
end

# Android Fastfile
lane :beta do
  gradle(task: "bundle", build_type: "Release")
  upload_to_play_store(track: "internal")
end

lane :release do
  gradle(task: "bundle", build_type: "Release")
  upload_to_play_store(track: "production")
end
```

### GitHub Actions

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: cd ios && fastlane beta

  deploy-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: cd android && fastlane beta
```

## 🎯 Launch Checklist

- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Support email configured
- [ ] App Store/Play Store listing complete
- [ ] Screenshots uploaded (all sizes)
- [ ] App icons finalized
- [ ] Version number set correctly
- [ ] Release notes written
- [ ] Marketing materials ready
- [ ] Social media announcement prepared
- [ ] Analytics configured
- [ ] Crash reporting enabled
- [ ] Push notifications tested
- [ ] Deep linking verified
- [ ] In-app purchases configured (if any)
- [ ] Age rating appropriate
- [ ] Content rating completed
- [ ] Store submission approved

## 🆘 Troubleshooting

### iOS Build Failures
```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reset pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

### Android Build Failures
```bash
# Clean gradle
cd android
./gradlew clean
cd ..

# Clear Flutter cache
flutter clean
flutter pub get
```

### Code Signing Issues (iOS)
- Verify Apple Developer account status
- Check provisioning profile validity
- Ensure certificate is not expired
- Match bundle ID in Xcode and App Store Connect

---

## 📞 Support

For deployment issues:
- Email: dev@tatakai.gabhasti.tech
- Discord: tatakai.gabhasti.tech/discord
- Documentation: tatakai.gabhasti.tech/docs

**Good luck with your launch! 🚀**
