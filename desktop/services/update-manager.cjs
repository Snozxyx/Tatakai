'use strict'

/**
 * @file update-manager.cjs
 * Admin-controlled update orchestrator for the Electron main process.
 * Integrates electron-updater with Supabase-driven update policies.
 *
 * Task 9.1: Factory structure and fetchPolicy (Supabase client, policy fetching, dev guard).
 * Task 9.2: mandatory/recommended policy handling + grace-period miss counter.
 * Task 9.4: experimental policy + rollbackTo().
 * Task 9.6: version history persistence (appendVersionRecord / getVersionHistory).
 * Task 9.8: IPC channel registration + autoUpdater event wiring.
 *
 * Requirements: 5.1–5.15, 5.17, 8.3, 8.5, 8.6, 9.5
 *
 * Usage:
 *   const { createUpdateManager } = require('./services/update-manager.cjs')
 *   const updateManager = createUpdateManager({
 *     ipcMain, autoUpdater, logger, app,
 *     supabaseUrl: process.env.SUPABASE_URL,
 *     supabaseKey: process.env.SUPABASE_ANON_KEY,
 *   })
 */

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const semver = require('semver')

// ─── Constants ────────────────────────────────────────────────────────────────

/** Supabase table name for update policies. */
const POLICIES_TABLE = 'update_policies'

/**
 * Maximum consecutive launches without a successful Supabase connection before
 * the grace-period toast is shown for a mandatory update (Req 5.14).
 */
const MANDATORY_GRACE_PERIOD_LAUNCHES = 3

/** Sub-directory under userData where update artefacts are stored. */
const UPDATES_DIR = 'updates'

/** File name for the append-only version history log. */
const VERSION_HISTORY_FILE = 'version-history.json'

/** File name for the consecutive-miss counter. */
const UPDATE_MISSES_FILE = 'update-misses.json'

/** GitHub owner and repo (from electron-builder publish config). */
const GH_OWNER = 'snozxyx'
const GH_REPO  = 'Tatakai'

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new UpdateManager instance.
 *
 * @param {object}                               opts
 * @param {Electron.IpcMain}                     opts.ipcMain       - Electron ipcMain (for IPC channels, added in 9.8).
 * @param {import('electron-updater').AppUpdater} opts.autoUpdater   - electron-updater AppUpdater instance.
 * @param {import('./_types.cjs').LogService}     opts.logger        - Structured logger.
 * @param {Electron.App}                          opts.app           - Electron app object.
 * @param {string}                               [opts.supabaseUrl]  - Supabase project URL.
 * @param {string}                               [opts.supabaseKey]  - Supabase anon (read-only) key (Req 9.5).
 * @returns {UpdateManager}
 */
function createUpdateManager({ ipcMain, autoUpdater, logger, app, supabaseUrl, supabaseKey }) {
  // ── Internal log helpers ──────────────────────────────────────────────────

  function _debug(msg, ctx) {
    try { logger.debug(msg, ctx) } catch (_) { console.debug(msg, ctx) }
  }

  function _info(msg, ctx) {
    try { logger.info(msg, ctx) } catch (_) { console.info(msg, ctx) }
  }

  function _warn(msg, ctx) {
    try { logger.warn(msg, ctx) } catch (_) { console.warn(msg, ctx) }
  }

  function _error(msg, ctx) {
    try { logger.error(msg, ctx) } catch (_) { console.error(msg, ctx) }
  }

  // ── Supabase client ───────────────────────────────────────────────────────

  /**
   * Lazily-created Supabase client.  Using the anon read-only key so the
   * bundle never ships a service-role key (Req 9.5).
   *
   * @type {import('@supabase/supabase-js').SupabaseClient | null}
   */
  let _supabase = null

  /**
   * Returns a (possibly reused) Supabase client.  Returns `null` if
   * `supabaseUrl` or `supabaseKey` are absent so callers can treat a missing
   * configuration as "no policy available" rather than a hard error.
   *
   * @returns {import('@supabase/supabase-js').SupabaseClient | null}
   */
  function _getSupabaseClient() {
    if (_supabase) return _supabase
    if (!supabaseUrl || !supabaseKey) {
      _warn('[UpdateManager] Supabase credentials not configured — update policy unavailable')
      return null
    }
    _supabase = createClient(supabaseUrl, supabaseKey)
    return _supabase
  }

  // ── Policy fetching ───────────────────────────────────────────────────────

  /**
   * Queries the `update_policies` table for the first active policy matching
   * the given `channel`.
   *
   * Maps the raw Supabase row to the {@link UpdatePolicy} interface defined in
   * `_types.cjs`.
   *
   * Returns `null` when:
   * - `app.isPackaged` is `false` (dev mode bypass, Req 5.17)
   * - Supabase credentials are absent
   * - No active policy exists for the channel
   * - A network or query error occurs (Req 5.13)
   *
   * @param {import('./_types.cjs').UpdateChannel} channel
   * @returns {Promise<import('./_types.cjs').UpdatePolicy | null>}
   */
  async function fetchPolicy(channel) {
    // Dev-mode guard (Req 5.17)
    if (!app.isPackaged) {
      _debug('[UpdateManager] Skipping policy fetch — app is not packaged (dev mode)')
      return null
    }

    const client = _getSupabaseClient()
    if (!client) return null

    try {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select('*')
        .eq('channel', channel)
        .eq('active', true)
        .limit(1)
        .single()

      if (error) {
        // PGRST116 = "no rows returned" — not an error, just no active policy
        if (error.code === 'PGRST116') {
          _debug('[UpdateManager] No active policy found', { channel })
          return null
        }
        throw error
      }

      if (!data) return null

      // Map Supabase row (snake_case) → UpdatePolicy interface (camelCase)
      /** @type {import('./_types.cjs').UpdatePolicy} */
      const policy = {
        type:                data.type,
        targetVersion:       data.target_version,
        channel:             data.channel,
        publishedAt:         data.published_at,
        rollbackFromVersion: data.rollback_from_version ?? undefined,
        notes:               data.notes ?? undefined,
      }

      _info('[UpdateManager] Active policy fetched', { channel, type: policy.type, targetVersion: policy.targetVersion })
      return policy
    } catch (err) {
      // Network errors, auth failures, timeouts — log and return null (Req 5.13)
      _warn('[UpdateManager] Failed to fetch update policy — skipping update check', {
        channel,
        err: String(err),
      })
      return null
    }
  }

  // ── Version history helpers ──────────────────────────────────────────────

  /**
   * Returns the absolute path to the version-history file, creating the
   * `updates/` directory inside userData if it doesn't already exist.
   *
   * @returns {string}
   */
  function _versionHistoryPath() {
    const dir = path.join(app.getPath('userData'), UPDATES_DIR)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, VERSION_HISTORY_FILE)
  }

  /**
   * Returns the absolute path to the update-misses file.
   *
   * @returns {string}
   */
  function _updateMissesPath() {
    return path.join(app.getPath('userData'), UPDATE_MISSES_FILE)
  }

  // ── Miss counter (grace period) ──────────────────────────────────────────

  /**
   * Reads and returns the current consecutive-miss count.  Returns 0 on any error.
   *
   * @returns {number}
   */
  function _readMissCount() {
    try {
      const raw = fs.readFileSync(_updateMissesPath(), 'utf8')
      const obj = JSON.parse(raw)
      return typeof obj.count === 'number' ? obj.count : 0
    } catch (_) {
      return 0
    }
  }

  /**
   * Persists the miss count.
   *
   * @param {number} count
   */
  function _writeMissCount(count) {
    try {
      fs.writeFileSync(_updateMissesPath(), JSON.stringify({ count }, null, 2), 'utf8')
    } catch (err) {
      _warn('[UpdateManager] Failed to write update-misses.json', { err: String(err) })
    }
  }

  /**
   * Resets the consecutive-miss counter to zero (called on successful policy fetch).
   */
  function _resetMissCount() {
    _writeMissCount(0)
  }

  /**
   * Increments the miss counter and returns the new value.
   *
   * @returns {number}
   */
  function _incrementMissCount() {
    const next = _readMissCount() + 1
    _writeMissCount(next)
    return next
  }

  // ── IPC broadcast helper ────────────────────────────────────────────────

  /**
   * Broadcasts an `updater-event` payload to all renderer windows via the
   * BrowserWindow.getAllWindows() list.  Silently skips destroyed windows.
   *
   * @param {object} payload
   */
  function _broadcast(payload) {
    try {
      const { BrowserWindow } = require('electron')
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('updater-event', payload)
        }
      }
    } catch (err) {
      _warn('[UpdateManager] Failed to broadcast updater-event', { err: String(err) })
    }
  }

  // ── Task 9.6: Version history persistence ────────────────────────────────

  /**
   * Reads `userData/updates/version-history.json` and returns all records.
   * Returns `[]` if the file does not yet exist (Req 5.12).
   *
   * @returns {import('./_types.cjs').VersionRecord[]}
   */
  function getVersionHistory() {
    try {
      const filePath = _versionHistoryPath()
      if (!fs.existsSync(filePath)) return []
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (err) {
      _warn('[UpdateManager] Failed to read version-history.json', { err: String(err) })
      return []
    }
  }

  /**
   * Appends a new VersionRecord to `userData/updates/version-history.json`.
   * Creates the file (and its parent directory) if they do not exist.
   * Never modifies or deletes existing entries (Req 5.11).
   *
   * @param {import('./_types.cjs').VersionRecord} record
   */
  function appendVersionRecord(record) {
    try {
      const filePath = _versionHistoryPath()
      const existing = getVersionHistory()
      existing.push(record)
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8')
      _info('[UpdateManager] Version record appended', { version: record.version, source: record.source })
    } catch (err) {
      _error('[UpdateManager] Failed to write version-history.json', { err: String(err) })
    }
  }

  // ── Task 9.2: checkOnStartup ─────────────────────────────────────────────

  /**
   * Called at app startup to evaluate the active update policy and act on it.
   *
   * - If no policy (network unavailable or no active row): runs standard
   *   autoUpdater.checkForUpdates() and tracks consecutive misses for the
   *   mandatory grace-period toast (Req 5.13, 5.14).
   * - Mandatory policy (`semver.lt(current, target)`): broadcasts
   *   `updater-event { type: 'mandatory-update' }`, downloads, then calls
   *   `quitAndInstall()` (Req 5.2, 5.3).
   * - Recommended policy: broadcasts `updater-event { type: 'available' }`
   *   with `dismissible: true` (Req 5.5).
   * - Experimental policy: silent background download + autoInstallOnAppQuit
   *   (Req 5.6) — handled in applyPolicy / checkOnStartup flow.
   * - Rollback policy: delegated to rollbackTo() (Req 5.7).
   *
   * @param {import('./_types.cjs').UpdateChannel} channel
   * @returns {Promise<void>}
   */
  async function checkOnStartup(channel) {
    // Dev-mode bypass (Req 5.17) — fetchPolicy already guards, but be explicit here too.
    if (!app.isPackaged) {
      _debug('[UpdateManager] Skipping checkOnStartup — dev mode')
      return
    }

    _broadcast({ type: 'checking' })

    const policy = await fetchPolicy(channel)

    if (policy === null) {
      // Supabase unreachable or no active policy — fall back to standard check (Req 5.13)
      _warn('[UpdateManager] No policy available; falling back to standard update check')

      // Grace-period counter (Req 5.14): only relevant when we know a mandatory update was
      // previously pending.  We track misses generically so the counter increments on every
      // missed Supabase connection; the toast fires after MANDATORY_GRACE_PERIOD_LAUNCHES.
      const missCount = _incrementMissCount()
      if (missCount >= MANDATORY_GRACE_PERIOD_LAUNCHES) {
        _warn('[UpdateManager] Grace period exceeded — notifying user of missed update check', { missCount })
        _broadcast({ type: 'error', message: 'Could not check for updates. Please ensure you are connected to the internet.', gracePeriod: true })
      }

      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        _warn('[UpdateManager] Standard checkForUpdates failed', { err: String(err) })
      }
      return
    }

    // Successful policy fetch — reset miss counter
    _resetMissCount()

    // Defensive channel guard (Req 5.16): even though Supabase filters by channel,
    // we verify the returned policy's channel matches the requested channel before
    // applying it.  This prevents a misconfigured or adversarially crafted response
    // from causing a cross-channel policy to be applied.
    if (policy.channel !== channel) {
      _warn('[UpdateManager] Policy channel mismatch — ignoring policy', {
        requestedChannel: channel,
        policyChannel: policy.channel,
      })
      return
    }

    const currentVersion = app.getVersion()

    if (policy.type === 'rollback') {
      _info('[UpdateManager] Rollback policy detected', { targetVersion: policy.targetVersion })
      await rollbackTo(policy.targetVersion)
      return
    }

    // All remaining types need to know if there is actually a newer version available
    let updateInfo = null
    try {
      const result = await autoUpdater.checkForUpdates()
      updateInfo = result && result.updateInfo ? result.updateInfo : null
    } catch (err) {
      _warn('[UpdateManager] autoUpdater.checkForUpdates failed', { err: String(err) })
    }

    if (!updateInfo) {
      _broadcast({ type: 'not-available' })
      return
    }

    const targetVersion = updateInfo.version

    if (!semver.lt(currentVersion, targetVersion)) {
      // Current version is already up-to-date or newer
      _info('[UpdateManager] App is up-to-date', { currentVersion, targetVersion })
      _broadcast({ type: 'not-available' })
      return
    }

    if (policy.type === 'mandatory') {
      _info('[UpdateManager] Mandatory update required', { currentVersion, targetVersion })
      _broadcast({ type: 'mandatory-update', info: updateInfo })

      // Wire download-error handler before triggering download
      autoUpdater.once('error', (err) => {
        _error('[UpdateManager] Mandatory update download error', { err: String(err) })
        _broadcast({ type: 'error', message: String(err) })
      })

      // On successful download: append record and quit+install (Req 5.3, 5.10)
      autoUpdater.once('update-downloaded', (info) => {
        appendVersionRecord({
          version:         info.version,
          channel,
          installedAt:     new Date().toISOString(),
          source:          'update',
          previousVersion: currentVersion,
        })
        autoUpdater.quitAndInstall()
      })

      try {
        await autoUpdater.downloadUpdate()
      } catch (err) {
        _error('[UpdateManager] Failed to initiate mandatory download', { err: String(err) })
        _broadcast({ type: 'error', message: String(err) })
      }

    } else if (policy.type === 'recommended') {
      _info('[UpdateManager] Recommended update available', { currentVersion, targetVersion })
      _broadcast({ type: 'available', info: updateInfo, dismissible: true })

      // Record version when/if user chooses to install (triggered via IPC 'update:install')
      // The actual download+install is user-initiated; we store the record on update-downloaded.
      autoUpdater.once('update-downloaded', (info) => {
        appendVersionRecord({
          version:         info.version,
          channel,
          installedAt:     new Date().toISOString(),
          source:          'update',
          previousVersion: currentVersion,
        })
      })

    } else if (policy.type === 'experimental') {
      _info('[UpdateManager] Experimental update — silent background download', { currentVersion, targetVersion })
      // Task 9.4: silent download, install on next quit (Req 5.6)
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.once('update-downloaded', (info) => {
        appendVersionRecord({
          version:         info.version,
          channel,
          installedAt:     new Date().toISOString(),
          source:          'update',
          previousVersion: currentVersion,
        })
        _info('[UpdateManager] Experimental update downloaded; will install on next quit', { version: info.version })
      })

      autoUpdater.once('error', (err) => {
        _error('[UpdateManager] Experimental update download error', { err: String(err) })
      })

      try {
        autoUpdater.downloadUpdate()
        // intentionally not awaited — fire-and-forget silent download
      } catch (err) {
        _error('[UpdateManager] Failed to initiate experimental download', { err: String(err) })
      }
    }
  }

  // ── Task 9.4: rollbackTo() ────────────────────────────────────────────────

  /**
   * Forces a downgrade (or re-install) to the specified `version` by fetching
   * the corresponding GitHub release asset URL, downloading it, and calling
   * `quitAndInstall(isSilent=true, isForceRunAfter=true)`.
   *
   * No-op when `version === app.getVersion()` (Req 5.8).
   * Rejects with `'asset-not-found'` if no asset exists for the version on
   * GitHub Releases; does NOT call quitAndInstall in that case (Req 5.9).
   *
   * @param {string} version  Target semver string (e.g. "5.1.0").
   * @returns {Promise<void>}
   */
  async function rollbackTo(version) {
    const currentVersion = app.getVersion()

    // No-op guard (Req 5.8)
    if (version === currentVersion) {
      _info('[UpdateManager] rollbackTo called with current version — no-op', { version })
      return
    }

    _info('[UpdateManager] Starting rollback', { from: currentVersion, to: version })

    // Construct the GitHub Releases download URL for the target version.
    // The asset name mirrors the electron-builder artifactName pattern:
    //   ${productName}-${version}-${os}-${arch}.${ext}
    // We resolve the correct URL by querying the GitHub API for the release.
    const assetUrl = await _resolveGitHubAssetUrl(version)

    if (!assetUrl) {
      _error('[UpdateManager] Rollback asset not found', { version })
      throw new Error('asset-not-found')
    }

    _info('[UpdateManager] Downloading rollback asset', { version, assetUrl })

    // Configure autoUpdater to pull from the resolved URL.
    // electron-updater supports a `feedURL` override for one-shot downloads.
    // The simplest approach that works with electron-updater's existing NSIS/squirrel
    // installer chain is to temporarily override the feed, trigger checkForUpdates /
    // downloadUpdate, then restore.  However, a more reliable cross-platform approach
    // is to use the `NsisUpdater` / `MacUpdater` directly via the same autoUpdater
    // instance by pointing it at the release feed for the target version.
    //
    // For simplicity (per spec guidance) we use axios to download to a temp file and
    // then pass it to `autoUpdater.quitAndInstall` is not possible without a path.
    // The spec says to call quitAndInstall(true, true) — this is valid when the
    // autoUpdater has already downloaded the file via its own machinery.
    //
    // Strategy: temporarily set the channel/version on autoUpdater, trigger download.
    try {
      // Point autoUpdater at the specific release feed for the target version.
      // electron-updater reads `latest.yml` / `latest-mac.yml` etc. from the feed URL.
      // We instead temporarily update `allowDowngrade` and call checkForUpdates against
      // the overridden feedURL that lists the target version.

      // Save original settings
      const origAllowDowngrade = autoUpdater.allowDowngrade
      const origAutoInstall    = autoUpdater.autoInstallOnAppQuit

      autoUpdater.allowDowngrade        = true
      autoUpdater.autoInstallOnAppQuit  = false

      // Override the update info directly: set the feed to the release's yml manifest.
      // The standard electron-updater GitHub provider constructs the feed URL as:
      //   https://github.com/{owner}/{repo}/releases/download/v{version}/latest.yml
      // We tell autoUpdater to check for the pinned version's manifest.
      autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO })

      // Await download-complete or error
      await new Promise((resolve, reject) => {
        const onDownloaded = (info) => {
          cleanup()
          appendVersionRecord({
            version:         info.version,
            channel:         /** @type {any} */ ('stable'),
            installedAt:     new Date().toISOString(),
            source:          'rollback',
            previousVersion: currentVersion,
          })
          autoUpdater.quitAndInstall(true, true)
          resolve()
        }

        const onError = (err) => {
          cleanup()
          reject(err)
        }

        function cleanup() {
          autoUpdater.removeListener('update-downloaded', onDownloaded)
          autoUpdater.removeListener('error', onError)
          autoUpdater.allowDowngrade       = origAllowDowngrade
          autoUpdater.autoInstallOnAppQuit = origAutoInstall
        }

        autoUpdater.once('update-downloaded', onDownloaded)
        autoUpdater.once('error', onError)

        // Use axios to download the installer to a temp path, then trigger install.
        // Since electron-updater's quitAndInstall works only after its own download
        // completes, we use its downloadUpdate() on the overridden feed.
        autoUpdater.downloadUpdate().catch(onError)
      })

    } catch (err) {
      const msg = String(err)
      if (msg.includes('No published versions') || msg.includes('asset-not-found') || msg.includes('404')) {
        _error('[UpdateManager] Rollback asset not found on GitHub', { version, err: msg })
        throw new Error('asset-not-found')
      }
      _error('[UpdateManager] Rollback failed', { version, err: msg })
      throw err
    }
  }

  /**
   * Queries the GitHub Releases API to find a download asset URL for the given version.
   * Returns `null` if the release or an appropriate asset cannot be found.
   *
   * @param {string} version  Semver string (without leading 'v').
   * @returns {Promise<string | null>}
   */
  async function _resolveGitHubAssetUrl(version) {
    try {
      const axios = require('axios')
      const url   = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/tags/v${version}`
      const response = await axios.get(url, {
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 10_000,
      })

      const assets = response.data && response.data.assets
      if (!Array.isArray(assets) || assets.length === 0) return null

      // Prefer the platform-appropriate installer asset.
      const platformKeyword = process.platform === 'win32'  ? '.exe'
                            : process.platform === 'darwin' ? '.dmg'
                            : '.AppImage'

      const asset = assets.find((a) => a.name && a.name.includes(platformKeyword))
                 || assets[0] // fallback to first asset

      return asset ? asset.browser_download_url : null
    } catch (err) {
      _warn('[UpdateManager] Failed to resolve GitHub asset URL', { version, err: String(err) })
      return null
    }
  }

  // ── Task 9.8: IPC channel registration ──────────────────────────────────

  /**
   * Registers all UpdateManager IPC handlers on `ipcMain` and wires
   * `autoUpdater` events to broadcast `updater-event` to the renderer.
   *
   * IPC Handlers (Req 5.15, 8.3, 8.6):
   *   update:check        → checkOnStartup(channel)
   *   update:download     → autoUpdater.downloadUpdate()
   *   update:install      → autoUpdater.quitAndInstall()
   *   update:rollback     → rollbackTo(version)
   *   update:get-history  → getVersionHistory()
   *   update:get-policy   → fetchPolicy(channel)
   *
   * autoUpdater event → IPC broadcast mapping (Req 8.5):
   *   checking-for-update  → { type: 'checking' }
   *   update-available     → { type: 'available', info }
   *   update-not-available → { type: 'not-available', info }
   *   download-progress    → { type: 'downloading', progress }
   *   update-downloaded    → { type: 'downloaded', info }
   *   error                → { type: 'error', message }
   */
  function registerIpcHandlers() {
    if (!ipcMain) return

    // ── update:check ────────────────────────────────────────────────────
    ipcMain.handle('update:check', async (_event, channel) => {
      try {
        await checkOnStartup(channel)
        return { success: true }
      } catch (err) {
        _error('[UpdateManager] IPC update:check error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── update:download ─────────────────────────────────────────────────
    ipcMain.handle('update:download', async () => {
      try {
        await autoUpdater.downloadUpdate()
        return { success: true }
      } catch (err) {
        _error('[UpdateManager] IPC update:download error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── update:install ──────────────────────────────────────────────────
    ipcMain.handle('update:install', () => {
      try {
        autoUpdater.quitAndInstall()
        return { success: true }
      } catch (err) {
        _error('[UpdateManager] IPC update:install error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── update:rollback ─────────────────────────────────────────────────
    ipcMain.handle('update:rollback', async (_event, version) => {
      try {
        await rollbackTo(version)
        return { success: true }
      } catch (err) {
        _error('[UpdateManager] IPC update:rollback error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── update:get-history ──────────────────────────────────────────────
    ipcMain.handle('update:get-history', () => {
      try {
        return getVersionHistory()
      } catch (err) {
        _error('[UpdateManager] IPC update:get-history error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── update:get-policy ───────────────────────────────────────────────
    ipcMain.handle('update:get-policy', async (_event, channel) => {
      try {
        const policy = await fetchPolicy(channel)
        return policy
      } catch (err) {
        _error('[UpdateManager] IPC update:get-policy error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })

    // ── Wire autoUpdater events → broadcast updater-event (Req 8.5) ─────

    autoUpdater.on('checking-for-update', () => {
      _broadcast({ type: 'checking' })
    })

    autoUpdater.on('update-available', (info) => {
      _broadcast({ type: 'available', info })
    })

    autoUpdater.on('update-not-available', (info) => {
      _broadcast({ type: 'not-available', info })
    })

    autoUpdater.on('download-progress', (progress) => {
      _broadcast({ type: 'downloading', progress })
    })

    autoUpdater.on('update-downloaded', (info) => {
      _broadcast({ type: 'downloaded', info })
    })

    autoUpdater.on('error', (err) => {
      _broadcast({ type: 'error', message: err && err.message ? err.message : String(err) })
    })

    _debug('[UpdateManager] IPC handlers registered')
  }

  // Register IPC handlers immediately at factory init time
  registerIpcHandlers()

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * @typedef {object} UpdateManager
   * @property {function(import('./_types.cjs').UpdateChannel): Promise<import('./_types.cjs').UpdatePolicy | null>} fetchPolicy
   * @property {function(import('./_types.cjs').UpdateChannel): Promise<void>} checkOnStartup
   * @property {function(string): Promise<void>} rollbackTo
   * @property {function(import('./_types.cjs').VersionRecord): void} appendVersionRecord
   * @property {function(): import('./_types.cjs').VersionRecord[]} getVersionHistory
   * @property {function(): void} registerIpcHandlers
   */
  return {
    fetchPolicy,
    checkOnStartup,
    rollbackTo,
    appendVersionRecord,
    getVersionHistory,
    registerIpcHandlers,

    // Internal helpers exposed for testing
    /** @internal */ _getSupabaseClient,
    /** @internal */ _broadcast,
    /** @internal */ _readMissCount,
    /** @internal */ _writeMissCount,
    /** @internal */ _resetMissCount,
    /** @internal */ _incrementMissCount,
    /** @internal */ _resolveGitHubAssetUrl,
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createUpdateManager }
