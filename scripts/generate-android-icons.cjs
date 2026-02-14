const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../resources/icon-512.png');
const androidResDir = path.join(__dirname, '../android/app/src/main/res');

// Android icon sizes for different densities
const iconSizes = [
  { density: 'mipmap-ldpi', size: 36 },
  { density: 'mipmap-mdpi', size: 48 },
  { density: 'mipmap-hdpi', size: 72 },
  { density: 'mipmap-xhdpi', size: 96 },
  { density: 'mipmap-xxhdpi', size: 144 },
  { density: 'mipmap-xxxhdpi', size: 192 },
];

// Adaptive icon foreground sizes (with padding for safe zone)
const foregroundSizes = [
  { density: 'mipmap-ldpi', size: 54 },
  { density: 'mipmap-mdpi', size: 72 },
  { density: 'mipmap-hdpi', size: 108 },
  { density: 'mipmap-xhdpi', size: 144 },
  { density: 'mipmap-xxhdpi', size: 216 },
  { density: 'mipmap-xxxhdpi', size: 288 },
];

async function generateIcons() {
  console.log('Generating Android app icons from:', sourceIcon);
  
  // Check if source exists
  if (!fs.existsSync(sourceIcon)) {
    console.error('Source icon not found:', sourceIcon);
    process.exit(1);
  }

  // Generate standard launcher icons
  for (const { density, size } of iconSizes) {
    const outputDir = path.join(androidResDir, density);
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Standard icon
    await sharp(sourceIcon)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher.png'));
    
    // Round icon (same as standard for now)
    await sharp(sourceIcon)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, 'ic_launcher_round.png'));

    console.log(`Generated ${density} icons (${size}x${size})`);
  }

  // Generate adaptive icon foreground (larger with padding)
  for (const { density, size } of foregroundSizes) {
    const outputDir = path.join(androidResDir, density);
    
    // Create foreground with icon centered (72dp icon in 108dp canvas = 66% of canvas)
    const iconSize = Math.floor(size * 0.66);
    const padding = Math.floor((size - iconSize) / 2);
    
    // Create a transparent background with the icon centered
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{
      input: await sharp(sourceIcon).resize(iconSize, iconSize).toBuffer(),
      top: padding,
      left: padding
    }])
    .png()
    .toFile(path.join(outputDir, 'ic_launcher_foreground.png'));

    console.log(`Generated ${density} foreground (${size}x${size})`);
  }

  console.log('\\nAll Android icons generated successfully!');
}

generateIcons().catch(console.error);
