const fs = require('fs')
const path = require('path')

/**
 * WebOS packaging script
 * Prepares the Next.js build for webOS packaging
 */

const buildDir = path.join(__dirname, '../.next')
const staticDir = path.join(__dirname, '../out')
const webosDir = path.join(__dirname, '../webos-package')

async function packageForWebOS() {
  console.log('🚀 Starting webOS packaging...')

  try {
    // Create webOS package directory
    if (fs.existsSync(webosDir)) {
      fs.rmSync(webosDir, { recursive: true })
    }
    fs.mkdirSync(webosDir, { recursive: true })

    // Copy Next.js build files
    console.log('📁 Copying build files...')
    
    // For non-static export, we need to copy the .next build
    if (fs.existsSync(buildDir)) {
      copyRecursiveSync(buildDir, path.join(webosDir, '.next'))
    }

    // Copy public files
    const publicDir = path.join(__dirname, '../public')
    if (fs.existsSync(publicDir)) {
      copyRecursiveSync(publicDir, path.join(webosDir, 'public'))
    }

    // Copy package.json for dependencies
    const packageJsonSource = path.join(__dirname, '../package.json')
    const packageJsonDest = path.join(webosDir, 'package.json')
    fs.copyFileSync(packageJsonSource, packageJsonDest)

    // Create webOS specific files
    console.log('📋 Creating webOS configuration...')
    
    // Copy appinfo.json
    const appinfoSource = path.join(__dirname, '../appinfo.json')
    const appinfoDest = path.join(webosDir, 'appinfo.json')
    fs.copyFileSync(appinfoSource, appinfoDest)

    // Create index.html for webOS entry point
    createWebOSIndexHTML(webosDir)

    // Create icon files
    console.log('🎨 Creating app icons...')
    createIcon(path.join(webosDir, 'icon.png'), 80)
    createIcon(path.join(webosDir, 'largeIcon.png'), 130)
    createIcon(path.join(webosDir, 'splash.png'), 640)

    // Create webOS launcher script
    createLauncherScript(webosDir)

    console.log('✅ WebOS packaging complete!')
    console.log(`📦 Package created at: ${webosDir}`)
    console.log('')
    console.log('🔧 To install on webOS TV:')
    console.log('1. Install webOS TV CLI: npm install -g @webosose/ares-cli')
    console.log(`2. Package app: ares-package ${webosDir}`)
    console.log('3. Install on TV: ares-install com.tatakai.webostv_1.0.0_all.ipk -d [DEVICE_NAME]')
    console.log('4. Launch app: ares-launch com.tatakai.webostv -d [DEVICE_NAME]')

  } catch (error) {
    console.error('❌ Packaging failed:', error.message)
    process.exit(1)
  }
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src)
  const stats = exists && fs.statSync(src)
  const isDirectory = exists && stats.isDirectory()

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      )
    })
  } else {
    fs.copyFileSync(src, dest)
  }
}

function createWebOSIndexHTML(webosDir) {
  const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tatakai - Anime Streaming</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            color: #fff;
            font-family: system-ui, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        .loading {
            text-align: center;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 3px solid #333;
            border-top: 3px solid #8A2BE2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading">
        <h1>Tatakai</h1>
        <div class="spinner"></div>
        <p>Loading...</p>
    </div>
    
    <script>
        // webOS initialization
        if (typeof window.PalmSystem !== 'undefined') {
            window.PalmSystem.stageReady();
        }
        
        // Load the main app
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    </script>
</body>
</html>`

  fs.writeFileSync(path.join(webosDir, 'index.html'), indexHTML)
}

function createLauncherScript(webosDir) {
  const launcherScript = `#!/bin/bash
# WebOS TV App Launcher Script

echo "Starting Tatakai webOS TV App..."

# Set up environment
export NODE_ENV=production
export NEXT_PUBLIC_API_BASE_URL=https://aniwatch-api-taupe-eight.vercel.app

# Start the Next.js server (for non-static builds)
if [ -d ".next" ]; then
    echo "Starting Next.js server..."
    node .next/standalone/server.js
else
    echo "Error: Next.js build not found"
    exit 1
fi`

  fs.writeFileSync(path.join(webosDir, 'start.sh'), launcherScript)
  
  // Make executable
  try {
    fs.chmodSync(path.join(webosDir, 'start.sh'), '755')
  } catch (e) {
    console.warn('Could not make start.sh executable:', e.message)
  }
}

function createIcon(filepath, size) {
  // Create a simple SVG icon as placeholder
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#8A2BE2" rx="${size * 0.2}"/>
  <text x="50%" y="50%" text-anchor="middle" dy="0.3em" fill="white" font-family="Arial" font-size="${size * 0.4}" font-weight="bold">T</text>
</svg>`
  
  // Save as SVG (convert to PNG manually or with build tools)
  const svgPath = filepath.replace('.png', '.svg')
  fs.writeFileSync(svgPath, svg)
  console.log(`📝 Created icon: ${svgPath}`)
  console.log(`⚠️  Convert to PNG manually: ${filepath}`)
}

// Run packaging if called directly
if (require.main === module) {
  packageForWebOS()
}

module.exports = { packageForWebOS }