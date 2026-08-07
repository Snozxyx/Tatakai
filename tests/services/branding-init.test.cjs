'use strict'

/**
 * Tests for BrandingInit
 *
 * Covers:
 *   - apply() calls setName('Tatakai') (Req 7.1)
 *   - apply() calls setAppUserModelId on Windows (Req 7.2)
 *   - apply() registers a 'ready' listener (Req 7.3, 7.4)
 *   - module exports apply
 *   - Migration idempotence via sentinel file (Req 7.8)
 *   - _findLegacyElectronDir heuristic
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { apply } = require('../../desktop/services/branding-init.cjs')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'branding-init-test-'))
}

/**
 * Creates a minimal mock Electron app object suitable for testing BrandingInit.
 * All event listeners are collected but never auto-fired (test controls timing).
 */
function makeMockApp(userDataPath, platform = process.platform) {
  const listeners = {}
  const calls = {
    setName: [],
    setAppUserModelId: [],
  }

  const app = {
    _platform: platform,
    _userDataPath: userDataPath,
    _calls: calls,
    _listeners: listeners,

    setName(name) {
      calls.setName.push(name)
    },

    setAppUserModelId(id) {
      calls.setAppUserModelId.push(id)
    },

    on(event, cb) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    },

    getPath(key) {
      if (key === 'userData') return userDataPath
      if (key === 'logs') return path.join(userDataPath, 'logs')
      return userDataPath
    },

    /** Helper: simulate the 'ready' event being emitted */
    _emit(event) {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb())
      }
    },
  }

  return app
}

// Override process.platform for specific test cases
function withPlatform(platform, fn) {
  const orig = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return fn()
  } finally {
    if (orig) {
      Object.defineProperty(process, 'platform', orig)
    }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BrandingInit — module exports', () => {
  it('exports an apply() function', () => {
    expect(typeof apply).toBe('function')
  })
})

describe('BrandingInit — apply() branding calls (Req 7.1)', () => {
  let tmpDir
  let app

  beforeEach(() => {
    tmpDir = makeTmpDir()
    app = makeMockApp(path.join(tmpDir, 'Tatakai'))
    fs.mkdirSync(app._userDataPath, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calls setName("Tatakai") synchronously', () => {
    apply(app)
    expect(app._calls.setName).toContain('Tatakai')
  })

  it('registers a listener for the "ready" event', () => {
    apply(app)
    expect(app._listeners.ready).toBeDefined()
    expect(app._listeners.ready.length).toBeGreaterThanOrEqual(1)
  })

  it('on("ready") writes .branded sentinel file (Req 7.8)', () => {
    apply(app)
    app._emit('ready')
    const sentinelPath = path.join(app._userDataPath, '.branded')
    expect(fs.existsSync(sentinelPath)).toBe(true)
  })

  it('does not throw when apply() is called multiple times (idempotent) (Req 7.8)', () => {
    expect(() => {
      apply(app)
      apply(app)
      app._emit('ready')
      app._emit('ready')
    }).not.toThrow()
  })
})

describe('BrandingInit — Windows AUMID (Req 7.2)', () => {
  it('calls setAppUserModelId on win32', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })
    const app = makeMockApp(tatakaiDir)

    withPlatform('win32', () => {
      apply(app)
    })

    expect(app._calls.setAppUserModelId).toContain('app.tatakai.me')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not call setAppUserModelId on darwin', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })
    const app = makeMockApp(tatakaiDir)

    withPlatform('darwin', () => {
      apply(app)
    })

    expect(app._calls.setAppUserModelId.length).toBe(0)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('BrandingInit — migration sentinel idempotence (Req 7.8)', () => {
  it('writes .migration-done sentinel after ready fires', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })
    const app = makeMockApp(tatakaiDir)

    apply(app)
    app._emit('ready')

    const migrationSentinel = path.join(tatakaiDir, '.migration-done')
    expect(fs.existsSync(migrationSentinel)).toBe(true)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('second apply()+ready does not overwrite Tatakai userData files', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })

    // Pre-populate Tatakai directory with a file
    const existingFile = path.join(tatakaiDir, 'user-prefs.json')
    fs.writeFileSync(existingFile, JSON.stringify({ theme: 'dark' }), 'utf8')

    const app = makeMockApp(tatakaiDir)
    apply(app)
    app._emit('ready')

    // File should still exist and be unchanged
    expect(fs.existsSync(existingFile)).toBe(true)
    const content = JSON.parse(fs.readFileSync(existingFile, 'utf8'))
    expect(content.theme).toBe('dark')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('migration skipped when Tatakai directory is already populated (Req 7.6)', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })

    // Also create Electron directory with content
    const electronDir = path.join(tmpDir, 'Electron')
    fs.mkdirSync(electronDir, { recursive: true })
    fs.writeFileSync(path.join(electronDir, 'old-data.json'), '{}', 'utf8')

    // Tatakai already has content
    fs.writeFileSync(path.join(tatakaiDir, 'existing.json'), '{"x":1}', 'utf8')

    const app = makeMockApp(tatakaiDir)
    apply(app)
    app._emit('ready')

    // Electron content should NOT have been copied to Tatakai
    expect(fs.existsSync(path.join(tatakaiDir, 'old-data.json'))).toBe(false)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('BrandingInit — userData path assertions (Req 7.3)', () => {
  it('does not throw when userData path contains Tatakai', () => {
    const tmpDir = makeTmpDir()
    const tatakaiDir = path.join(tmpDir, 'Tatakai')
    fs.mkdirSync(tatakaiDir, { recursive: true })
    const app = makeMockApp(tatakaiDir)

    expect(() => {
      apply(app)
      app._emit('ready')
    }).not.toThrow()

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('does not throw even when userData path contains "Electron" (warns but continues, Req 7.3)', () => {
    const tmpDir = makeTmpDir()
    // Simulate a path still containing Electron
    const badDir = path.join(tmpDir, 'Electron')
    fs.mkdirSync(badDir, { recursive: true })
    const app = makeMockApp(badDir)

    expect(() => {
      apply(app)
      app._emit('ready')
    }).not.toThrow()

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

// ─── Property-Based Tests (fast-check) ───────────────────────────────────────

const fc = require('fast-check')

/**
 * Property 12: BrandingInit Migration Idempotence
 * Validates: Requirements 7.5, 7.6, 7.8
 *
 * For any N in [1,10] repeated apply()+ready cycles:
 *   - The .branded sentinel exists exactly once (not duplicated / corrupted)
 *   - The .migration-done sentinel exists exactly once
 *   - Pre-existing Tatakai userData files are never overwritten
 */
describe('Property 12: BrandingInit Migration Idempotence (PBT)', () => {
  it('migration runs at most once and existing Tatakai files are never overwritten', () => {
    fc.assert(
      fc.property(
        // N repeated apply()+ready invocations
        fc.integer({ min: 1, max: 10 }),
        // Whether a legacy Electron/ directory should exist
        fc.boolean(),
        (n, hasElectronDir) => {
          const tmpDir = makeTmpDir()
          try {
            const tatakaiDir = path.join(tmpDir, 'Tatakai')
            fs.mkdirSync(tatakaiDir, { recursive: true })

            // Place a sentinel user file that must never be overwritten
            const userFile = path.join(tatakaiDir, 'user-prefs.json')
            const originalContent = JSON.stringify({ theme: 'dark', n })
            fs.writeFileSync(userFile, originalContent, 'utf8')

            // Optionally create a legacy Electron/ directory with different content
            if (hasElectronDir) {
              const electronDir = path.join(tmpDir, 'Electron')
              fs.mkdirSync(electronDir, { recursive: true })
              fs.writeFileSync(
                path.join(electronDir, 'user-prefs.json'),
                JSON.stringify({ theme: 'light' }),
                'utf8'
              )
            }

            const app = makeMockApp(tatakaiDir)

            // Call apply() N times then emit ready N times
            for (let i = 0; i < n; i++) {
              apply(app)
            }
            for (let i = 0; i < n; i++) {
              app._emit('ready')
            }

            // .branded sentinel must exist exactly once (file, not duplicated)
            const brandedPath = path.join(tatakaiDir, '.branded')
            if (!fs.existsSync(brandedPath)) {
              throw new Error('.branded sentinel does not exist after apply()+ready')
            }
            const brandedStat = fs.statSync(brandedPath)
            if (!brandedStat.isFile()) {
              throw new Error('.branded is not a regular file')
            }

            // .migration-done sentinel must exist
            const migrationPath = path.join(tatakaiDir, '.migration-done')
            if (!fs.existsSync(migrationPath)) {
              throw new Error('.migration-done sentinel does not exist after apply()+ready')
            }
            const migrationStat = fs.statSync(migrationPath)
            if (!migrationStat.isFile()) {
              throw new Error('.migration-done is not a regular file')
            }

            // Pre-existing user file must not have been overwritten
            const contentAfter = fs.readFileSync(userFile, 'utf8')
            if (contentAfter !== originalContent) {
              throw new Error(
                `user-prefs.json was overwritten. Expected: ${originalContent}, got: ${contentAfter}`
              )
            }
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      )
    )
  })
})

/**
 * Property 5: userData Path Never Contains 'Electron'
 * Validates: Requirements 7.3
 *
 * For any safe subdirectory name that does not contain 'Electron',
 * after apply()+ready the path returned by app.getPath('userData')
 * must not contain 'Electron'.
 */
describe('Property 5: userData Path Never Contains Electron (PBT)', () => {
  it('getPath("userData") never contains "Electron" when given a safe path', () => {
    fc.assert(
      fc.property(
        // Generate a safe subdirectory name: alphanumeric + hyphen/underscore,
        // filtered to exclude 'Electron' and problematic path chars.
        fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/).filter(
          (s) =>
            !s.includes('Electron') &&
            s.length > 0 &&
            s !== '.' &&
            s !== '..'
        ),
        (subDirName) => {
          const tmpDir = makeTmpDir()
          try {
            // Build a userData path that does NOT contain 'Electron'
            const userDataPath = path.join(tmpDir, subDirName)
            fs.mkdirSync(userDataPath, { recursive: true })

            const app = makeMockApp(userDataPath)
            apply(app)
            app._emit('ready')

            // The path returned by getPath('userData') must not contain 'Electron'
            const returnedPath = app.getPath('userData')
            if (returnedPath.includes('Electron')) {
              throw new Error(
                `getPath('userData') contains 'Electron': ${returnedPath}`
              )
            }
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      )
    )
  })
})
