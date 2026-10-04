# Mobile signing and manual updates

Tatakai publishes certificate-less mobile artifacts through GitHub Releases.
The app only checks the latest release version and opens the release page; it
does not download or install an update silently.

## Android

`android/app/build.gradle` intentionally leaves the release build without a
signing configuration. CI produces `Tatakai-<version>-android-unsigned.apk`.
A store, maintainer, or sideload distributor must sign that APK before Android
will install it. Debug emulator builds continue to use Android's standard debug
keystore.

## iOS

The Release Xcode configuration disables code signing. CI builds an unsigned
device `.app` and packages it as `Tatakai-<version>-ios-unsigned.ipa`.

iOS cannot directly install or update an unsigned IPA. The user must sign it
with their own Apple account and install it with a sideloading tool or managed
distribution system. Each update repeats that signing/install step. Tatakai's
manual update button opens the latest GitHub Release so the user can obtain the
new artifact.

On macOS, the equivalent desktop build uses a free ad-hoc signature only to
preserve bundle integrity. That mechanism does not make an iOS app installable,
so the iOS artifact remains explicitly unsigned for downstream signing.

## Local unsigned iOS build

Run on macOS with Xcode installed:

```bash
npm run mobile:build:ios:unsigned
```

The `.app` is written below `ios/build/Build/Products/Release-iphoneos/`.
