# Android Emulator Setup Script for Tatakai Mobile

Write-Host "=== Tatakai Mobile - Android Emulator Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Android Studio is installed
Write-Host "Step 1: Checking Android Studio installation..." -ForegroundColor Yellow
$androidStudioPath = "$env:LOCALAPPDATA\Android\Sdk"
$androidHome = $env:ANDROID_HOME

if (-not (Test-Path $androidStudioPath) -and -not $androidHome) {
    Write-Host "❌ Android SDK not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Android Studio from:" -ForegroundColor Yellow
    Write-Host "https://developer.android.com/studio" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After installation:" -ForegroundColor Yellow
    Write-Host "1. Open Android Studio" -ForegroundColor White
    Write-Host "2. Go to: Tools → SDK Manager" -ForegroundColor White
    Write-Host "3. Install: Android SDK Platform-Tools, Android SDK Build-Tools" -ForegroundColor White
    Write-Host "4. Go to: Tools → AVD Manager" -ForegroundColor White
    Write-Host "5. Click 'Create Virtual Device'" -ForegroundColor White
    Write-Host "6. Select a phone (e.g., Pixel 7)" -ForegroundColor White
    Write-Host "7. Download a system image (e.g., Android 14)" -ForegroundColor White
    Write-Host "8. Finish setup and run this script again" -ForegroundColor White
    exit 1
}

Write-Host "✓ Android SDK found at: $androidStudioPath" -ForegroundColor Green

# Step 2: Accept licenses
Write-Host ""
Write-Host "Step 2: Accepting Android licenses..." -ForegroundColor Yellow
flutter doctor --android-licenses

# Step 3: List available emulators
Write-Host ""
Write-Host "Step 3: Available emulators:" -ForegroundColor Yellow
flutter emulators

# Step 4: Instructions to create emulator if none exist
Write-Host ""
Write-Host "If no emulators are listed above, create one:" -ForegroundColor Yellow
Write-Host "1. Open Android Studio" -ForegroundColor White
Write-Host "2. Tools → AVD Manager → Create Virtual Device" -ForegroundColor White
Write-Host "3. Choose: Pixel 7 (or any phone)" -ForegroundColor White
Write-Host "4. Download system image: Android 14 (API 34)" -ForegroundColor White
Write-Host "5. Click Finish" -ForegroundColor White
Write-Host ""
Write-Host "After creating an emulator, run:" -ForegroundColor Cyan
Write-Host "  flutter emulators --launch <emulator-name>" -ForegroundColor White
Write-Host "  flutter run" -ForegroundColor White
Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
