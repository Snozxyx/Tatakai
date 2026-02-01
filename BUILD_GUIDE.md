# Tatakai Desktop - Production Build Guide

## Setup

1. **Update GitHub Configuration**
   - Edit `package.json` and replace `YOUR_GITHUB_USERNAME` in the `build.publish` section
   - Edit `desktop/main.cjs` and replace `YOUR_GITHUB_USERNAME` in autoUpdater.setFeedURL

2. **Create GitHub Repository**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/Tatakai.git
   git push -u origin main
   ```

3. **Generate GitHub Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with `repo` scope
   - Save as `GH_TOKEN` in your environment or use GitHub Secrets for CI/CD

## Local Build

### Windows
```bash
npm install
npm run build
npm run electron:build
```

Output: `dist_desktop/Tatakai-{version}-win-x64.exe`

### macOS
```bash
npm install
npm run build
npm run electron:build
```

Output: `dist_desktop/Tatakai-{version}-mac-x64.dmg`

### Linux
```bash
npm install
npm run build
npm run electron:build
```

Output: `dist_desktop/Tatakai-{version}-linux-x64.AppImage`

## CI/CD Deployment

1. **Tag a Release**
   ```bash
   git tag -a v4.1.0 -m "Release v4.1.0"
   git push origin v4.1.0
   ```

2. **GitHub Actions automatically:**
   - Builds for Windows, macOS, Linux
   - Creates GitHub Release
   - Uploads installers
   - Users get automatic updates

## Testing Auto-Update

1. Build and install version `4.1.0`
2. Create a new release `v4.1.1` on GitHub
3. Launch the app → Settings → Desktop → Check for Updates
4. App should detect new version and offer to download

## Features

✅ **Fixed Issues:**
- Export logs now uses correct Tatakai directory (not Electron)
- Video player embed works (disabled sandbox)
- Subtitles download with detailed logging
- All notifications show "Tatakai" branding
- App name set to "Tatakai" throughout

✅ **CI/CD:**
- Automated builds for Windows/Mac/Linux
- GitHub Releases integration
- Auto-updater configured

✅ **Installers:**
- Windows: NSIS installer + Portable
- macOS: DMG + ZIP
- Linux: AppImage + DEB

## Troubleshooting

### Subtitles not showing?
Check console logs for:
```
[REPAIR] ✓ Subtitle saved: Episode_1_English.vtt (12345 bytes)
```

### Auto-update not working?
1. Ensure `GH_TOKEN` is set
2. Check GitHub username in config files
3. Verify release is published (not draft)

### Build fails?
```bash
# Clear cache and rebuild
rm -rf node_modules dist dist_desktop
npm install
npm run electron:build
```
