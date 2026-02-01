const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const icongen = require('icon-gen');

const sourceIcon = path.join(__dirname, '../public/tatakai-logo-square.png');
const outputDir = path.join(__dirname, '../resources');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

async function generateIcons() {
    console.log('Generating icons...');

    // 1. Generate PNGs for various sizes
    const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
    for (const size of sizes) {
        await sharp(sourceIcon)
            .resize(size, size)
            .toFile(path.join(outputDir, `icon-${size}.png`));
    }

    // 2. Generate .ico and .icns for Electron
    try {
        const results = await icongen(sourceIcon, outputDir, {
            report: true,
            ico: { name: 'icon', sizes: [16, 32, 48, 64, 128, 256] },
            icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512, 1024] }
        });
        console.log('Electron icons generated:', results);
    } catch (err) {
        console.error('Error generating Electron icons:', err);
    }

    // 3. Generate Android/iOS icons
    const mobileDir = path.join(outputDir, 'mobile');
    if (!fs.existsSync(mobileDir)) fs.mkdirSync(mobileDir);

    // Simple copy/resize for Capacitor (you'd normally use @capacitor/assets, but this is a manual start)
    await sharp(sourceIcon).resize(1024, 1024).toFile(path.join(mobileDir, 'icon-only.png'));
    await sharp(path.join(__dirname, '../public/tatakai-logo-with-bg.png'))
        .resize(2732, 2732, { fit: 'contain', background: '#000000' })
        .toFile(path.join(mobileDir, 'splash.png'));

    console.log('All icons generated in /resources');
}

generateIcons().catch(console.error);
