const fs = require('fs')
const path = require('path')

/**
 * WebOS packaging script
 * Prepares the Next.js export for webOS packaging
 */

const distDir = path.join(__dirname, '../dist')
const webosDir = path.join(__dirname, '../webos-package')

async function packageForWebOS() {
  console.log('🚀 Starting webOS packaging...')

  try {
    // Create webOS package directory
    if (fs.existsSync(webosDir)) {
      fs.rmSync(webosDir, { recursive: true })
    }
    fs.mkdirSync(webosDir, { recursive: true })

    // Copy dist files
    console.log('📁 Copying build files...')
    if (fs.existsSync(distDir)) {
      copyRecursiveSync(distDir, webosDir)
    } else {
      throw new Error('Dist directory not found. Run "npm run build" first.')
    }

    // Copy webOS specific files
    console.log('📋 Copying webOS configuration...')
    
    // Copy appinfo.json
    const appinfoSource = path.join(__dirname, '../appinfo.json')
    const appinfoDest = path.join(webosDir, 'appinfo.json')
    fs.copyFileSync(appinfoSource, appinfoDest)

    // Create package structure
    console.log('📦 Creating package structure...')
    
    // Create icon files (placeholders)
    createIcon(path.join(webosDir, 'icon.png'), 80)
    createIcon(path.join(webosDir, 'largeIcon.png'), 130)
    createIcon(path.join(webosDir, 'splash.png'), 640)

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
      fs.mkdirSync(dest)
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

function createIcon(filepath, size) {
  // Create a simple SVG icon as placeholder
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#8A2BE2" rx="${size * 0.2}"/>
      <text x="50%" y="50%" text-anchor="middle" dy="0.3em" fill="white" font-family="Arial" font-size="${size * 0.3}" font-weight="bold">T</text>
    </svg>
  `
  
  // Note: In a real implementation, you'd want to use a proper image conversion library
  // For now, we'll create the SVG file and note that it should be converted to PNG
  fs.writeFileSync(filepath.replace('.png', '.svg'), svg)
  console.log(`📝 Created placeholder icon: ${filepath.replace('.png', '.svg')}`)
  console.log(`⚠️  Convert to PNG manually: ${filepath}`)
}

// Run packaging if called directly
if (require.main === module) {
  packageForWebOS()
}

module.exports = { packageForWebOS }