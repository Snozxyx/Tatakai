'use strict'

/**
 * @file fetch-cloudflared.cjs
 * Ensures the per-platform `cloudflared` binary exists in resources/bin/ so
 * electron-builder bundles it (host-hosted watch-party tunnels). Pulled from
 * the cloudflare/cloudflared GitHub Releases "latest" — never committed to git
 * (the 55 MB binary stays out of the repo).
 *
 * Mirrors the CI "Download cloudflared" step so a local `npm run electron:build`
 * ships the exact same binary GitHub Actions does.
 *
 * Skips when a real binary is already present; set FORCE=1 to re-download.
 */

const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const axios = require('axios')

const ROOT    = path.join(__dirname, '..')
const BIN_DIR = path.join(ROOT, 'resources', 'bin')
const BASE    = 'https://github.com/cloudflare/cloudflared/releases/latest/download'

function targetFor(platform, arch) {
  if (platform === 'win32') return { asset: 'cloudflared-windows-amd64.exe', out: 'cloudflared.exe', tgz: false }
  if (platform === 'linux') return { asset: 'cloudflared-linux-amd64',       out: 'cloudflared',     tgz: false }
  if (platform === 'darwin') {
    const a = arch === 'arm64' ? 'arm64' : 'amd64'
    return { asset: `cloudflared-darwin-${a}.tgz`, out: 'cloudflared', tgz: true }
  }
  throw new Error(`Unsupported platform: ${platform}`)
}

async function download(url, dest) {
  const res = await axios.get(url, { responseType: 'stream', maxRedirects: 5, timeout: 180000 })
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest)
    res.data.pipe(ws)
    ws.on('finish', resolve)
    ws.on('error', reject)
    res.data.on('error', reject)
  })
}

async function main() {
  const { asset, out, tgz } = targetFor(process.platform, process.arch)
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true })
  const outPath = path.join(BIN_DIR, out)

  if (!process.env.FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 1_000_000) {
    console.log(`[cloudflared] already present → ${path.relative(ROOT, outPath)} (FORCE=1 to re-download)`)
    return
  }

  const url = `${BASE}/${asset}`
  console.log(`[cloudflared] downloading ${url}`)
  if (tgz) {
    const tmp = path.join(os.tmpdir(), asset)
    await download(url, tmp)
    execFileSync('tar', ['-xzf', tmp, '-C', BIN_DIR], { stdio: 'inherit' })
    fs.rmSync(tmp, { force: true })
  } else {
    await download(url, outPath)
  }
  if (process.platform !== 'win32') { try { fs.chmodSync(outPath, 0o755) } catch (_) {} }
  const mb = (fs.statSync(outPath).size / 1e6).toFixed(1)
  console.log(`[cloudflared] ready → ${path.relative(ROOT, outPath)} (${mb} MB)`)
}

main().catch((e) => { console.error('[cloudflared] FAILED:', e.message); process.exit(1) })
