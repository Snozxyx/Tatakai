'use strict'

/**
 * @file generate-installer-assets.cjs
 * Generates Tatakai-branded NSIS installer graphics from the app's brand tokens.
 * Run: npm run assets:installer
 *
 * Outputs (build/):
 *   installerSidebar.bmp    164 x 314  — Welcome / Finish page left panel
 *   uninstallerSidebar.bmp  164 x 314  — same, for the uninstaller
 *   installerHeader.bmp     150 x  57  — inner-page header strip (top-right)
 *
 * NSIS/MUI only accept uncompressed BMP, and sharp cannot write BMP, so we
 * rasterize an SVG to raw RGB with sharp and hand-encode a 24-bit
 * BITMAPINFOHEADER bitmap (bottom-up, 4-byte row padding).
 */

const fs   = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT    = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'build')
const LOGO    = path.join(ROOT, 'public', 'assets', 'logo', 'tatakai-logo-square.png')

// ── Brand tokens (mirror desktop/splash.html / src/index.css) ──────────────────
const BG        = '#08060a'
const BG_TOP    = '#171018'
const BG_MID    = '#0d0a0d'
const PRIMARY   = 'hsl(340, 82%, 65%)'
const SECONDARY = 'hsl(320, 70%, 55%)'
const ACCENT    = 'hsl(268, 70%, 62%)'
const FG        = '#f7f3f5'
const FG_MUTED  = 'hsl(340, 12%, 66%)'

const logoHref = `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`

// ── SVG designs ────────────────────────────────────────────────────────────────
// Modern dark-glass aesthetic: layered mesh blooms, a soft glow halo behind the
// crisp logo ring, a left-edge gradient accent, and tight type. All filters are
// plain feGaussianBlur (fully supported by sharp's SVG rasterizer).

function sidebarSvg(w, h) {
  const cx = w / 2
  const logo = 84
  const ly = Math.round(h * 0.31)
  const tBase = ly + logo / 2
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="0.55" stop-color="${BG_MID}"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="bloomA" cx="0.12" cy="0.05" r="0.75">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomB" cx="0.96" cy="0.98" r="0.85">
      <stop offset="0" stop-color="${SECONDARY}" stop-opacity="0.36"/>
      <stop offset="0.7" stop-color="${SECONDARY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomC" cx="0.85" cy="0.28" r="0.55">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="0.8" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.60"/>
      <stop offset="1" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${SECONDARY}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${SECONDARY}"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${PRIMARY}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${SECONDARY}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip"><circle cx="${cx}" cy="${ly}" r="${logo / 2}"/></clipPath>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomA)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomB)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomC)"/>
  <circle cx="${cx}" cy="${ly}" r="${logo / 2 + 34}" fill="none" stroke="${FG}" stroke-opacity="0.05" stroke-width="1"/>
  <circle cx="${cx}" cy="${ly}" r="${logo / 2 + 52}" fill="none" stroke="${FG}" stroke-opacity="0.03" stroke-width="1"/>
  <rect x="0" y="0" width="3" height="${h}" fill="url(#edge)"/>
  <circle cx="${cx}" cy="${ly}" r="${logo * 0.62}" fill="url(#halo)" filter="url(#soft)"/>
  <circle cx="${cx}" cy="${ly}" r="${logo / 2 + 4}" fill="none" stroke="url(#ring)" stroke-opacity="0.85" stroke-width="2"/>
  <image href="${logoHref}" x="${cx - logo / 2}" y="${ly - logo / 2}" width="${logo}" height="${logo}" clip-path="url(#clip)" preserveAspectRatio="xMidYMid slice"/>
  <text x="${cx}" y="${tBase + 46}" text-anchor="middle" font-family="Segoe UI Semibold, Segoe UI, Arial, sans-serif" font-weight="800" font-size="32" letter-spacing="-1.2" fill="${FG}">Tatakai</text>
  <text x="${cx}" y="${tBase + 67}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="9" letter-spacing="3.2" fill="${FG_MUTED}">OTAKU COMMUNITY</text>
  <rect x="${cx - 24}" y="${tBase + 79}" width="48" height="3" rx="1.5" fill="url(#bar)"/>
  <text x="${cx}" y="${h - 18}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="8" letter-spacing="1.2" fill="${FG_MUTED}">by @Snozxyx</text>
</svg>`
}

function headerSvg(w, h) {
  const logo = 40
  const ly = (h - logo) / 2
  const lx = w - logo - 12
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="${BG}"/><stop offset="0.6" stop-color="${BG_MID}"/><stop offset="1" stop-color="${BG_TOP}"/>
    </linearGradient>
    <radialGradient id="g" cx="1" cy="0.1" r="1.15">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.34"/>
      <stop offset="0.7" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${SECONDARY}"/>
    </linearGradient>
    <linearGradient id="under" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="${PRIMARY}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${SECONDARY}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="clip"><circle cx="${lx + logo / 2}" cy="${ly + logo / 2}" r="${logo / 2}"/></clipPath>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="14" y="${h / 2 + 6}" font-family="Segoe UI Semibold, Segoe UI, Arial, sans-serif" font-weight="800" font-size="19" letter-spacing="-0.6" fill="${FG}">Tatakai</text>
  <rect x="14" y="${h / 2 + 12}" width="34" height="2.5" rx="1.25" fill="url(#under)"/>
  <circle cx="${lx + logo / 2}" cy="${ly + logo / 2}" r="${logo * 0.6}" fill="url(#halo)" filter="url(#soft)"/>
  <circle cx="${lx + logo / 2}" cy="${ly + logo / 2}" r="${logo / 2 + 2}" fill="none" stroke="url(#ring)" stroke-opacity="0.85" stroke-width="1.5"/>
  <image href="${logoHref}" x="${lx}" y="${ly}" width="${logo}" height="${logo}" clip-path="url(#clip)" preserveAspectRatio="xMidYMid slice"/>
</svg>`
}

// ── One-click install splash (landscape, shown ~1.8s via AdvSplash) ────────────
// Full-bleed dark hero: mesh blooms + a glowing logo ring, the Tatakai wordmark,
// the OTAKU COMMUNITY kicker, an accent underbar, and a "setting things up" line.
// Encoded as a 24-bit BMP — the only format AdvSplash accepts.
function splashSvg(w, h) {
  const cx = Math.round(w * 0.5)
  const logo = Math.round(h * 0.30)
  const ly = Math.round(h * 0.34)
  const tBase = ly + logo / 2
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="0.55" stop-color="${BG_MID}"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="bloomA" cx="0.08" cy="0.02" r="0.7">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.40"/>
      <stop offset="0.7" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomB" cx="0.97" cy="1" r="0.8">
      <stop offset="0" stop-color="${SECONDARY}" stop-opacity="0.34"/>
      <stop offset="0.7" stop-color="${SECONDARY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomC" cx="0.9" cy="0.12" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="0.8" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PRIMARY}" stop-opacity="0.62"/>
      <stop offset="1" stop-color="${PRIMARY}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${SECONDARY}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${SECONDARY}"/>
    </linearGradient>
    <clipPath id="clip"><circle cx="${cx}" cy="${ly}" r="${logo / 2}"/></clipPath>
    <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomA)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomB)"/>
  <rect width="${w}" height="${h}" fill="url(#bloomC)"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${FG}" stroke-opacity="0.06" stroke-width="1"/>
  <circle cx="${cx}" cy="${ly}" r="${logo * 0.66}" fill="url(#halo)" filter="url(#soft)"/>
  <circle cx="${cx}" cy="${ly}" r="${logo / 2 + 5}" fill="none" stroke="url(#ring)" stroke-opacity="0.9" stroke-width="2.5"/>
  <image href="${logoHref}" x="${cx - logo / 2}" y="${ly - logo / 2}" width="${logo}" height="${logo}" clip-path="url(#clip)" preserveAspectRatio="xMidYMid slice"/>
  <text x="${cx}" y="${tBase + 52}" text-anchor="middle" font-family="Segoe UI Semibold, Segoe UI, Arial, sans-serif" font-weight="800" font-size="46" letter-spacing="-1.5" fill="${FG}">Tatakai</text>
  <text x="${cx}" y="${tBase + 76}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="11" letter-spacing="5" fill="${FG_MUTED}">OTAKU COMMUNITY</text>
  <rect x="${cx - 28}" y="${tBase + 88}" width="56" height="3" rx="1.5" fill="url(#bar)"/>
  <text x="${cx}" y="${h - 20}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="10" letter-spacing="1.5" fill="${FG_MUTED}">Setting things up…</text>
</svg>`
}

// ── 24-bit BMP encoder (BI_RGB, bottom-up) ─────────────────────────────────────
function encodeBmp24(rgb, width, height) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4 // padded to 4 bytes
  const pixels  = rowSize * height
  const buf     = Buffer.alloc(54 + pixels)

  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54 + pixels, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(54, 10)          // pixel data offset
  buf.writeUInt32LE(40, 14)          // DIB header size
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)       // positive → bottom-up
  buf.writeUInt16LE(1, 26)           // planes
  buf.writeUInt16LE(24, 28)          // bpp
  buf.writeUInt32LE(0, 30)           // BI_RGB
  buf.writeUInt32LE(pixels, 34)
  buf.writeInt32LE(2835, 38)         // 72 DPI x
  buf.writeInt32LE(2835, 42)         // 72 DPI y
  buf.writeUInt32LE(0, 46)
  buf.writeUInt32LE(0, 50)

  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 3 // flip vertically
    let dst = 54 + y * rowSize
    for (let x = 0; x < width; x++) {
      const s = src + x * 3
      buf[dst++] = rgb[s + 2] // B
      buf[dst++] = rgb[s + 1] // G
      buf[dst++] = rgb[s]     // R
    }
  }
  return buf
}

async function renderBmp(svg, w, h, outFile) {
  const { data } = await sharp(Buffer.from(svg))
    .flatten({ background: BG })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  fs.writeFileSync(outFile, encodeBmp24(data, w, h))
  console.log(`  ✓ ${path.relative(ROOT, outFile)}  (${w}x${h})`)
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log('[installer-assets] Generating Tatakai NSIS graphics…')
  await renderBmp(sidebarSvg(164, 314), 164, 314, path.join(OUT_DIR, 'installerSidebar.bmp'))
  await renderBmp(sidebarSvg(164, 314), 164, 314, path.join(OUT_DIR, 'uninstallerSidebar.bmp'))
  await renderBmp(headerSvg(150, 57), 150, 57, path.join(OUT_DIR, 'installerHeader.bmp'))
  await renderBmp(splashSvg(500, 312), 500, 312, path.join(OUT_DIR, 'installerSplash.bmp'))

  // Optional PNG previews (2x) for eyeballing the design outside of NSIS.
  if (process.env.PREVIEW) {
    await sharp(Buffer.from(sidebarSvg(164, 314))).png().resize(328, 628)
      .toFile(path.join(OUT_DIR, 'preview-sidebar.png'))
    await sharp(Buffer.from(headerSvg(150, 57))).png().resize(300, 114)
      .toFile(path.join(OUT_DIR, 'preview-header.png'))
    await sharp(Buffer.from(splashSvg(500, 312))).png().resize(1000, 624)
      .toFile(path.join(OUT_DIR, 'preview-splash.png'))
    console.log('  ✓ preview-sidebar.png / preview-header.png / preview-splash.png')
  }

  console.log('[installer-assets] Done.')
}

main().catch((err) => {
  console.error('[installer-assets] FAILED:', err)
  process.exit(1)
})
