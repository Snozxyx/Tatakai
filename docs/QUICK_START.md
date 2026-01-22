# Tatakai Mobile - Quick Start Guide

Get up and running in 15 minutes!

## ⚡ Prerequisites Checklist

- [ ] Flutter SDK installed ([Get Flutter](https://flutter.dev/docs/get-started/install))
- [ ] IDE installed (VS Code or Android Studio)
- [ ] iOS: Xcode 14+ (macOS only)
- [ ] Android: Android Studio + SDK
- [ ] Git installed

## 🚀 5-Minute Setup

### 1. Verify Flutter Installation

```bash
flutter doctor
```

Expected output: All checkmarks ✓

### 2. Clone and Navigate

```bash
cd /path/to/tatakai/project
cd tatakai_mobile
```

### 3. Install Dependencies

```bash
flutter pub get
```

### 4. Run App

```bash
# List available devices
flutter devices

# Run on specific device
flutter run -d <device_id>

# Or simply
flutter run
```

## 🔥 Firebase Setup (10 Minutes)

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Name: `Tatakai Mobile`
4. Enable Google Analytics (optional)

### 2. Add iOS App

1. Click iOS icon
2. Bundle ID: `com.tatakai.mobile`
3. Download `GoogleService-Info.plist`
4. Place in `ios/Runner/`

### 3. Add Android App

1. Click Android icon
2. Package name: `com.tatakai.mobile`
3. Download `google-services.json`
4. Place in `android/app/`

### 4. Enable Services

In Firebase Console:
- **Authentication** → Enable Email/Password, Google
- **Cloud Messaging** → Enabled by default
- **Crashlytics** → Enable (optional)
- **Analytics** → Enabled by default

## 🛠️ Code Generation

Generate JSON serialization code:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

This creates `.g.dart` files for all models.

## 📱 Running on Devices

### iOS Simulator

```bash
open -a Simulator
flutter run
```

### Android Emulator

```bash
# List emulators
flutter emulators

# Launch emulator
flutter emulators --launch <emulator_id>

# Run app
flutter run
```

### Physical Device

#### iOS
1. Connect iPhone via USB
2. Trust computer on iPhone
3. Open in Xcode: `open ios/Runner.xcworkspace`
4. Select device in Xcode
5. Build and run

#### Android
1. Enable Developer Mode on phone
2. Enable USB Debugging
3. Connect via USB
4. Trust computer
5. Run: `flutter run`

## 🎨 Hot Reload

While app is running:
- Press `r` - Hot reload
- Press `R` - Hot restart
- Press `p` - Show performance overlay
- Press `q` - Quit

## 🐛 Troubleshooting

### "Flutter not found"
```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$PATH:/path/to/flutter/bin"

# Then
source ~/.zshrc
```

### iOS Build Fails
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
flutter clean
flutter run
```

### Android Build Fails
```bash
cd android
./gradlew clean
cd ..
flutter clean
flutter pub get
flutter run
```

### Code Generation Errors
```bash
flutter pub get
flutter pub run build_runner clean
flutter pub run build_runner build --delete-conflicting-outputs
```

### "No devices found"
```bash
# iOS
open -a Simulator

# Android
flutter emulators --launch Pixel_6_API_33

# Check devices
flutter devices
```

## 📝 Environment Setup

### Create .env file (Already included)
```env
API_BASE_URL=https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime
SUPABASE_URL=https://xkbzamfyupjafugqeaby.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PROXY_URL=https://xkbzamfyupjafugqeaby.supabase.co/functions/v1/rapid-service
```

## 🎯 Next Steps

1. **Explore the code**
   - Check `lib/screens/` for all screens
   - Review `lib/services/` for API integrations
   - Look at `lib/models/` for data structures

2. **Implement Providers**
   - Create provider files in `lib/providers/`
   - Follow examples in `ARCHITECTURE.md`

3. **Connect Screens to Data**
   - Update screens to use providers
   - Replace placeholder data with real API calls

4. **Test on Devices**
   - Test on iOS simulator
   - Test on Android emulator
   - Test on real devices

5. **Customize**
   - Update app icon
   - Modify themes
   - Add features

## 📚 Key Files to Know

```
lib/
├── main.dart              # App entry point - Start here
├── config/
│   ├── env.dart           # API URLs and keys
│   ├── theme.dart         # 15+ themes defined here
│   └── router.dart        # All routes defined
├── services/
│   ├── api_service.dart   # HiAnime API client
│   └── supabase_service.dart  # Auth and database
└── screens/
    └── home/home_screen.dart  # Main screen
```

## 🔧 Useful Commands

```bash
# Check for issues
flutter doctor -v

# Update dependencies
flutter pub upgrade

# Clear cache
flutter clean

# Format code
flutter format .

# Analyze code
flutter analyze

# Run tests
flutter test

# Build APK
flutter build apk

# Build iOS
flutter build ios

# Show app size
flutter build apk --analyze-size
```

## 🎨 IDE Setup

### VS Code Extensions
- Flutter
- Dart
- Dart Data Class Generator
- Error Lens
- GitLens

### Android Studio Plugins
- Flutter
- Dart
- Rainbow Brackets

## 📖 Documentation

- `README.md` - Overview and features
- `ARCHITECTURE.md` - Technical architecture
- `API_INTEGRATION.md` - API integration guide
- `DEPLOYMENT_GUIDE.md` - App Store deployment
- `CONTRIBUTING.md` - Contribution guidelines
- `PROJECT_SUMMARY.md` - Complete feature list

## 💡 Pro Tips

1. **Use Hot Reload**: Speeds up development 10x
2. **Check Flutter DevTools**: Great for debugging
3. **Use `const` constructors**: Improves performance
4. **Follow Dart guidelines**: Run `flutter analyze` often
5. **Test on real devices**: Emulators can be misleading
6. **Read the docs**: All questions answered in docs/

## 🆘 Getting Help

1. Check documentation files
2. Review code comments
3. Run `flutter doctor`
4. Search Flutter issues on GitHub
5. Ask on Flutter Discord
6. Stack Overflow with `flutter` tag

## ✅ Success Checklist

- [ ] Flutter doctor shows all green checkmarks
- [ ] App runs on simulator/emulator
- [ ] Hot reload works
- [ ] Firebase configured
- [ ] Code generation successful
- [ ] No lint errors (`flutter analyze`)
- [ ] Can navigate between screens
- [ ] Themes can be switched
- [ ] API calls work (check logs)

## 🎉 You're Ready!

Now you can:
- Explore the codebase
- Implement provider logic
- Add new features
- Customize UI
- Deploy to app stores

**Happy coding! 🚀**

---

Need more help? Check the other documentation files or reach out at dev@tatakai.gabhasti.tech
