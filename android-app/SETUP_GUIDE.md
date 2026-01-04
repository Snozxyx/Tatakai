# Tatakai Android App - Setup Guide

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

1. **Android Studio** - Hedgehog (2023.1.1) or newer
   - Download from: https://developer.android.com/studio
   
2. **JDK 17** or newer
   - Android Studio includes a JDK, or download from: https://adoptium.net/

3. **Android SDK**
   - Minimum API Level: 26 (Android 8.0)
   - Target API Level: 34 (Android 14)
   - Install via Android Studio SDK Manager

4. **Supabase Account**
   - Create a project at: https://supabase.com
   - Note your Project URL and Anon Key

## 🚀 Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd android-app
```

### 2. Configure Supabase Credentials

You have two options:

#### Option A: Using gradle.properties (Recommended for Development)

Edit `gradle.properties` in the project root:

```properties
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

#### Option B: Using local.properties (For Team Development)

Create `local.properties` in the project root:

```properties
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**Note:** `local.properties` is git-ignored by default for security.

### 3. Get Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

### 4. Open Project in Android Studio

1. Launch Android Studio
2. Select **Open** from the welcome screen
3. Navigate to the `android-app` folder
4. Click **OK**
5. Wait for Gradle sync to complete

### 5. Sync Gradle Dependencies

Android Studio will automatically sync dependencies. If not:
- Click **File** → **Sync Project with Gradle Files**
- Or click the sync icon in the toolbar

### 6. Setup Android Emulator (Optional)

If you don't have a physical device:

1. Click **Tools** → **Device Manager**
2. Click **Create Device**
3. Select a device (e.g., Pixel 6)
4. Select a system image (API 34 recommended)
5. Click **Finish**

### 7. Run the App

#### Using Android Studio:
1. Select your device/emulator from the device dropdown
2. Click the **Run** button (green play icon)
3. Or press `Shift + F10` (Windows/Linux) or `Ctrl + R` (Mac)

#### Using Command Line:
```bash
# Debug build
./gradlew installDebug

# Run on connected device
adb install app/build/outputs/apk/debug/app-debug.apk
```

## 🔧 Build Variants

### Debug Build
- Includes debugging tools
- No code obfuscation
- Faster build times
```bash
./gradlew assembleDebug
```

### Release Build
- Optimized and obfuscated code
- Requires signing configuration
```bash
./gradlew assembleRelease
```

## 🧪 Testing

### Run Unit Tests
```bash
./gradlew test
```

### Run Instrumentation Tests
```bash
./gradlew connectedAndroidTest
```

## 📱 Installing on Physical Device

### Enable Developer Mode:
1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times
3. Go back to **Settings** → **Developer Options**
4. Enable **USB Debugging**

### Install via USB:
1. Connect device via USB
2. Allow USB debugging prompt on device
3. Run from Android Studio or use `./gradlew installDebug`

## 🎨 App Icon Setup

The app currently uses placeholder icons. To add custom icons:

1. Right-click `res` folder → **New** → **Image Asset**
2. Select **Launcher Icons (Adaptive and Legacy)**
3. Choose your icon image
4. Configure foreground and background layers
5. Click **Next** and **Finish**

## 🔐 Signing for Release

### Create a Keystore:
```bash
keytool -genkey -v -keystore tatakai-release.keystore -alias tatakai -keyalg RSA -keysize 2048 -validity 10000
```

### Configure Signing in `app/build.gradle.kts`:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file("path/to/tatakai-release.keystore")
            storePassword = "your-store-password"
            keyAlias = "tatakai"
            keyPassword = "your-key-password"
        }
    }
    
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

## 🐛 Troubleshooting

### Gradle Sync Failed
- Check internet connection
- Invalidate caches: **File** → **Invalidate Caches** → **Invalidate and Restart**
- Check `gradle.properties` for correct syntax

### App Crashes on Launch
- Check Supabase credentials are correct
- Verify minimum SDK version (API 26+)
- Check Logcat for error messages

### ExoPlayer Issues
- Ensure device/emulator has API 26+
- Check network connectivity
- Verify video URL is accessible

### Download Manager Issues
- Check storage permissions are granted
- Ensure sufficient storage space
- Verify foreground service permission

### Build Errors
- Clean project: **Build** → **Clean Project**
- Rebuild: **Build** → **Rebuild Project**
- Check JDK version is 17+

## 📊 Performance Optimization

### Enable R8 for Release Builds
Already configured in `app/build.gradle.kts`:
```kotlin
buildTypes {
    release {
        isMinifyEnabled = true
        isShrinkResources = true
    }
}
```

### Optimize App Size
- Use vector drawables instead of PNGs
- Enable resource shrinking
- Use Android App Bundle (.aab) instead of APK

### Memory Management
- Use `remember` and `rememberSaveable` in Compose
- Dispose of ExoPlayer when not in use
- Implement proper lifecycle management

## 🌐 Supabase Schema Setup

Your Supabase database should include these tables:

### `profiles` Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users,
  email TEXT,
  username TEXT,
  avatar TEXT,
  theme TEXT DEFAULT 'midnight',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `watch_history` Table
```sql
CREATE TABLE watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  anime_id TEXT,
  episode_id TEXT,
  episode_number INTEGER,
  progress FLOAT,
  timestamp BIGINT,
  anime_title TEXT,
  anime_image TEXT
);
```

### `watchlist` Table
```sql
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  anime_id TEXT,
  added_at BIGINT
);
```

## 📚 Additional Resources

- [Jetpack Compose Documentation](https://developer.android.com/jetpack/compose)
- [Material Design 3](https://m3.material.io/)
- [ExoPlayer Guide](https://developer.android.com/guide/topics/media/exoplayer)
- [Supabase Android Documentation](https://supabase.com/docs/reference/kotlin)

## 🆘 Getting Help

If you encounter issues:
1. Check the error logs in Logcat
2. Review the troubleshooting section above
3. Create an issue in the repository
4. Contact the development team

## ✅ Verification Checklist

After setup, verify:
- [ ] App builds without errors
- [ ] App launches successfully
- [ ] Navigation between screens works
- [ ] Supabase authentication is functional
- [ ] Themes can be changed
- [ ] Haptic feedback works on button presses
- [ ] Video player can be accessed
- [ ] Downloads section is accessible

---

**Next Steps:**
- Implement data layer (ViewModels, Repositories)
- Integrate real anime data APIs
- Add AniSkip functionality
- Implement offline caching
- Add comprehensive testing

Happy coding! 🚀
