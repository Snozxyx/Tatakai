'use strict'

/**
 * Property-based tests for UpdateManager
 *
 * Covers four properties:
 *   Property 3:  Mandatory Update Blocks Interactive State (Req 5.2, 5.3)
 *   Property 4:  Rollback to Current Version is a No-Op (Req 5.8)
 *   Property 10: Version History is Append-Only (Req 5.10, 5.11)
 *   Property 9:  Channel Isolation (Req 5.16)
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test')
const fc = require('fast-check')
const fs = require('fs')
const path = require('path')
const os = require('os')
const semver = require('semver')
const { createUpdateManager } = require('../../desktop/services/update-manager.cjs')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'update-manager-test-'))
}

/**
 * Creates a minimal mock logger that silently accepts all log calls.
 */
function makeLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  }
}

/**
 * Creates a minimal mock ipcMain that records handle registrations.
 */
function makeIpcMain() {
  return {
    handle: () => {},
  }
}

/**
 * Creates a mock app.
 * @param {string} tmpDir - The temporary userData directory.
 * @param {string} version - The version string returned by getVersion().
 * @param {boolean} isPackaged - Whether the app appears packaged.
 */
function makeApp(tmpDir, version, isPackaged = true) {
  return {
    getPath: (key) => {
      if (key === 'userData') return tmpDir
      return tmpDir
    },
    getVersion: () => version,
    isPackaged,
  }
}

/**
 * Creates a mock autoUpdater with an event-emitter-like interface.
 * Supports once(), on(), emit(), and tracks calls to downloadUpdate / quitAndInstall.
 */
function makeAutoUpdater() {
  const listeners = {}

  const mock = {
    // tracking
    downloadUpdateCalled: false,
    quitAndInstallCalled: false,
    checkForUpdatesCalled: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,

    // EventEmitter-like API used by UpdateManager
    on(event, handler) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
    },
    once(event, handler) {
      const wrapper = (...args) => {
        mock.removeListener(event, wrapper)
        handler(...args)
      }
      mock.on(event, wrapper)
    },
    removeListener(event, handler) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler)
      }
    },
    emit(event, ...args) {
      const handlers = (listeners[event] || []).slice()
      handlers.forEach((h) => h(...args))
    },

    // Methods called by UpdateManager
    downloadUpdate() {
      mock.downloadUpdateCalled = true
      // Simulate successful download by emitting update-downloaded synchronously
      mock.emit('update-downloaded', { version: mock._downloadedVersion || '9.9.9' })
      return Promise.resolve()
    },
    quitAndInstall() {
      mock.quitAndInstallCalled = true
    },
    checkForUpdates() {
      mock.checkForUpdatesCalled = true
      return Promise.resolve({ updateInfo: null })
    },
    setFeedURL() {},
  }

  return mock
}

/**
 * Injects a mock Supabase client into require.cache so that
 * @supabase/supabase-js returns our mock when the UpdateManager calls createClient().
 *
 * Returns a restore function that removes the mock from cache.
 *
 * @param {object} mockClient - The mock Supabase client to inject.
 * @returns {{ restore: () => void }}
 */
function injectSupabaseMock(mockClient) {
  const supabaseModuleId = require.resolve('@supabase/supabase-js')
  const original = require.cache[supabaseModuleId]

  require.cache[supabaseModuleId] = {
    id: supabaseModuleId,
    filename: supabaseModuleId,
    loaded: true,
    exports: {
      createClient: () => mockClient,
    },
    parent: null,
    children: [],
    paths: [],
  }

  return {
    restore() {
      if (original) {
        require.cache[supabaseModuleId] = original
      } else {
        delete require.cache[supabaseModuleId]
      }
    },
  }
}

/**
 * Builds a minimal UpdatePolicy object.
 *
 * @param {string} type
 * @param {string} targetVersion
 * @param {string} channel
 * @returns {import('../../desktop/services/_types.cjs').UpdatePolicy}
 */
function makePolicy(type, targetVersion, channel = 'stable') {
  return {
    type,
    targetVersion,
    channel,
    publishedAt: new Date().toISOString(),
  }
}

/**
 * Creates a mock Supabase client that returns the given policy row
 * for any `from()...eq()...single()` chain.
 */
function makeSupabaseClientWithPolicy(policy) {
  const row = policy
    ? {
        type: policy.type,
        target_version: policy.targetVersion,
        channel: policy.channel,
        published_at: policy.publishedAt,
        rollback_from_version: policy.rollbackFromVersion ?? null,
        notes: policy.notes ?? null,
        active: true,
      }
    : null

  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: () =>
      Promise.resolve(
        row
          ? { data: row, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      ),
  }
  return chain
}

// ─── Semver arbitraries ───────────────────────────────────────────────────────

/**
 * Generates a valid semver string X.Y.Z where each component is 0–9.
 */
const semverArb = fc
  .tuple(
    fc.nat({ max: 9 }),
    fc.nat({ max: 9 }),
    fc.nat({ max: 9 })
  )
  .map(([a, b, c]) => `${a}.${b}.${c}`)

/**
 * Generates a pair (current, target) where semver.lt(current, target) is always true.
 * Strategy: generate current, then bump the patch (or minor/major) to ensure target > current.
 */
const semverPairArb = fc
  .tuple(
    fc.nat({ max: 8 }),
    fc.nat({ max: 9 }),
    fc.nat({ max: 9 })
  )
  .map(([a, b, c]) => {
    const current = `${a}.${b}.${c}`
    // Bump the major by 1 to guarantee target > current
    const target = `${a + 1}.${b}.${c}`
    return { current, target }
  })

// ─── Property 3: Mandatory Update Blocks Interactive State ────────────────────

/**
 * Property 3: Mandatory Update Blocks Interactive State
 * Validates: Requirements 5.2, 5.3
 *
 * For any pair (current, target) where semver.lt(current, target),
 * a mandatory policy must cause quitAndInstall() to be called,
 * confirming the blocking-install behaviour.
 */
describe('Property 3: Mandatory Update Blocks Interactive State (Req 5.2, 5.3)', () => {
  it('quitAndInstall is always called for any valid (current < target) semver pair with mandatory policy', async () => {
    await fc.assert(
      fc.asyncProperty(semverPairArb, async ({ current, target }) => {
        // Verify our generator produces a valid lt pair
        expect(semver.lt(current, target)).toBe(true)

        const tmpDir = makeTmpDir()

        try {
          const autoUpdater = makeAutoUpdater()
          // downloadedVersion should match target so the manager recognises it
          autoUpdater._downloadedVersion = target

          // Make checkForUpdates return update info pointing at target
          autoUpdater.checkForUpdates = () => {
            autoUpdater.checkForUpdatesCalled = true
            return Promise.resolve({ updateInfo: { version: target } })
          }

          const policy = makePolicy('mandatory', target, 'stable')
          const supabaseMock = makeSupabaseClientWithPolicy(policy)
          const { restore } = injectSupabaseMock(supabaseMock)

          try {
            // Remove update-manager from cache so the fresh require picks up our Supabase mock
            const umPath = require.resolve('../../desktop/services/update-manager.cjs')
            const originalUm = require.cache[umPath]
            delete require.cache[umPath]

            const { createUpdateManager: freshCreate } = require('../../desktop/services/update-manager.cjs')

            const manager = freshCreate({
              ipcMain: makeIpcMain(),
              autoUpdater,
              logger: makeLogger(),
              app: makeApp(tmpDir, current, true), // isPackaged = true
              supabaseUrl: 'https://fake.supabase.co',
              supabaseKey: 'fake-anon-key',
            })

            await manager.checkOnStartup('stable')

            // Restore update-manager cache entry
            if (originalUm) {
              require.cache[umPath] = originalUm
            } else {
              delete require.cache[umPath]
            }

            // The mandatory path MUST call quitAndInstall after download
            expect(autoUpdater.quitAndInstallCalled).toBe(true)
          } finally {
            restore()
          }
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true })
        }
      }),
      { numRuns: 20 }
    )
  })
})

// ─── Property 4: Rollback to Current Version is a No-Op ──────────────────────

/**
 * Property 4: Rollback to Current Version is a No-Op
 * Validates: Requirements 5.8
 *
 * For any valid semver string, calling rollbackTo(currentVersion) on an
 * UpdateManager initialised with that same version must:
 *   - never call autoUpdater.downloadUpdate()
 *   - leave version-history.json unchanged (empty)
 */
describe('Property 4: Rollback to Current Version is a No-Op (Req 5.8)', () => {
  it('downloadUpdate is never called and version history stays empty when rolling back to current version', async () => {
    await fc.assert(
      fc.asyncProperty(semverArb, async (version) => {
        const tmpDir = makeTmpDir()

        try {
          const autoUpdater = makeAutoUpdater()
          const supabaseMock = makeSupabaseClientWithPolicy(null)
          const { restore } = injectSupabaseMock(supabaseMock)

          try {
            const umPath = require.resolve('../../desktop/services/update-manager.cjs')
            const originalUm = require.cache[umPath]
            delete require.cache[umPath]

            const { createUpdateManager: freshCreate } = require('../../desktop/services/update-manager.cjs')

            const manager = freshCreate({
              ipcMain: makeIpcMain(),
              autoUpdater,
              logger: makeLogger(),
              app: makeApp(tmpDir, version, true),
              supabaseUrl: 'https://fake.supabase.co',
              supabaseKey: 'fake-anon-key',
            })

            // Call rollbackTo with the current version — must be a no-op
            await manager.rollbackTo(version)

            // Restore cache
            if (originalUm) {
              require.cache[umPath] = originalUm
            } else {
              delete require.cache[umPath]
            }

            // downloadUpdate must NOT have been called
            expect(autoUpdater.downloadUpdateCalled).toBe(false)

            // version-history.json must remain empty
            const history = manager.getVersionHistory()
            expect(history).toEqual([])
          } finally {
            restore()
          }
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true })
        }
      }),
      { numRuns: 20 }
    )
  })
})

// ─── Property 10: Version History is Append-Only ─────────────────────────────

/**
 * A VersionRecord arbitrary: generates valid VersionRecord objects.
 */
const versionRecordArb = fc.record({
  version: semverArb,
  channel: fc.constantFrom('stable', 'beta', 'experimental'),
  installedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2030-01-01') }).map((d) => d.toISOString()),
  source: fc.constantFrom('fresh-install', 'update', 'rollback'),
})

/**
 * Property 10: Version History is Append-Only
 * Validates: Requirements 5.10, 5.11
 *
 * For any sequence of VersionRecord objects:
 *   - After each appendVersionRecord call, getVersionHistory().length equals
 *     the number of records appended so far.
 *   - Previously appended records are never mutated.
 */
describe('Property 10: Version History is Append-Only (Req 5.10, 5.11)', () => {
  it('history length grows by exactly 1 per append and prior records are unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(versionRecordArb, { minLength: 1, maxLength: 15 }),
        (records) => {
          const tmpDir = makeTmpDir()

          try {
            const autoUpdater = makeAutoUpdater()

            const manager = createUpdateManager({
              ipcMain: makeIpcMain(),
              autoUpdater,
              logger: makeLogger(),
              app: makeApp(tmpDir, '1.0.0', false), // isPackaged=false keeps checkOnStartup no-op
              supabaseUrl: undefined,
              supabaseKey: undefined,
            })

            const snapshotsBefore = []

            for (let i = 0; i < records.length; i++) {
              const record = records[i]

              // Capture a deep copy of the current history before appending
              const historyBefore = manager.getVersionHistory().map((r) => JSON.stringify(r))

              manager.appendVersionRecord(record)

              const historyAfter = manager.getVersionHistory()

              // Length must equal i+1
              expect(historyAfter.length).toBe(i + 1)

              // All prior records must be unchanged
              for (let j = 0; j < i; j++) {
                expect(JSON.stringify(historyAfter[j])).toBe(historyBefore[j])
              }

              // The newly appended record must match what was passed in
              expect(historyAfter[i].version).toBe(record.version)
              expect(historyAfter[i].channel).toBe(record.channel)
              expect(historyAfter[i].source).toBe(record.source)

              snapshotsBefore.push(JSON.stringify(historyAfter[i]))
            }

            return true
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      ),
      { numRuns: 20 }
    )
  })
})

// ─── Property 9: Channel Isolation ───────────────────────────────────────────

/**
 * Property 9: Channel Isolation
 * Validates: Requirements 5.16
 *
 * An UpdateManager configured for 'stable' must never apply a policy whose
 * channel is 'beta' or 'experimental'.
 *
 * Concretely: when Supabase returns a mandatory policy with channel='beta'
 * or channel='experimental', quitAndInstall() must never be called and
 * no mandatory-update broadcast must be triggered for that policy.
 */
describe('Property 9: Channel Isolation (Req 5.16)', () => {
  it('beta/experimental policies are never applied when manager is configured for stable', async () => {
    /**
     * Generates a target version guaranteed to be higher than current ('1.0.0')
     * so the policy would be actionable — but only if the channel matched.
     */
    const nonStableChannelArb = fc.constantFrom('beta', 'experimental')
    const targetVersionArb = fc.tuple(
      fc.integer({ min: 2, max: 9 }),
      fc.nat({ max: 9 }),
      fc.nat({ max: 9 })
    ).map(([a, b, c]) => `${a}.${b}.${c}`)

    await fc.assert(
      fc.asyncProperty(
        nonStableChannelArb,
        targetVersionArb,
        async (wrongChannel, targetVersion) => {
          const tmpDir = makeTmpDir()

          try {
            const autoUpdater = makeAutoUpdater()
            autoUpdater._downloadedVersion = targetVersion
            autoUpdater.checkForUpdates = () => {
              autoUpdater.checkForUpdatesCalled = true
              return Promise.resolve({ updateInfo: { version: targetVersion } })
            }

            const broadcastedTypes = []

            // Policy has a non-stable channel — should not be applied to stable manager
            const policy = makePolicy('mandatory', targetVersion, wrongChannel)
            const supabaseMock = makeSupabaseClientWithPolicy(policy)
            const { restore } = injectSupabaseMock(supabaseMock)

            try {
              const umPath = require.resolve('../../desktop/services/update-manager.cjs')
              const originalUm = require.cache[umPath]
              delete require.cache[umPath]

              const { createUpdateManager: freshCreate } = require('../../desktop/services/update-manager.cjs')

              const manager = freshCreate({
                ipcMain: makeIpcMain(),
                autoUpdater,
                logger: makeLogger(),
                app: makeApp(tmpDir, '1.0.0', true), // isPackaged = true, current = 1.0.0
                supabaseUrl: 'https://fake.supabase.co',
                supabaseKey: 'fake-anon-key',
              })

              // Intercept _broadcast to capture all broadcast types
              const originalBroadcast = manager._broadcast.bind(manager)
              // We can't easily monkey-patch _broadcast since it's captured in closure,
              // but we CAN observe quitAndInstallCalled as the terminal indicator of policy application.

              // Call checkOnStartup with 'stable' — the manager queries Supabase for channel='stable'
              // The Supabase mock always returns the policy regardless of channel eq filter,
              // so this tests whether the manager correctly checks policy.channel vs requested channel.
              await manager.checkOnStartup('stable')

              // Restore cache
              if (originalUm) {
                require.cache[umPath] = originalUm
              } else {
                delete require.cache[umPath]
              }

              // The policy's channel is 'beta'/'experimental', not 'stable'.
              // The Supabase mock ignores the channel eq filter here — we are testing
              // that the manager correctly guards on policy.channel matching the requested channel.
              // Since our mock returns the policy for any channel query, we verify that
              // the manager rejects it if policy.channel !== requested channel.
              //
              // Looking at the UpdateManager source: fetchPolicy returns whatever Supabase
              // returns after filtering with .eq('channel', channel). In real usage the DB
              // enforces the filter. Our mock bypasses the filter, so the returned policy
              // will have channel='beta' when the manager asked for channel='stable'.
              //
              // The manager should NOT apply a policy whose .channel !== the requested channel.
              // According to Req 5.16 (channel isolation), the policy channel is enforced
              // both by the DB filter AND by a defensive check in the manager.
              //
              // If the manager has the defensive check, quitAndInstall is not called.
              // If it only relies on the DB filter (no defensive check), it would apply
              // the policy even though channel is wrong when the mock bypasses the filter.
              //
              // We test the observable outcome: quitAndInstall must NOT be called
              // regardless of how the policy reached the manager.
              expect(autoUpdater.quitAndInstallCalled).toBe(false)

            } finally {
              restore()
            }
          } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
          }
        }
      ),
      { numRuns: 15 }
    )
  })

  it('stable policy IS applied when manager is configured for stable', async () => {
    // Positive control: confirm the machinery works for the correct channel
    const tmpDir = makeTmpDir()

    try {
      const autoUpdater = makeAutoUpdater()
      autoUpdater._downloadedVersion = '2.0.0'
      autoUpdater.checkForUpdates = () =>
        Promise.resolve({ updateInfo: { version: '2.0.0' } })

      const policy = makePolicy('mandatory', '2.0.0', 'stable')
      const supabaseMock = makeSupabaseClientWithPolicy(policy)
      const { restore } = injectSupabaseMock(supabaseMock)

      try {
        const umPath = require.resolve('../../desktop/services/update-manager.cjs')
        delete require.cache[umPath]
        const { createUpdateManager: freshCreate } = require('../../desktop/services/update-manager.cjs')

        const manager = freshCreate({
          ipcMain: makeIpcMain(),
          autoUpdater,
          logger: makeLogger(),
          app: makeApp(tmpDir, '1.0.0', true),
          supabaseUrl: 'https://fake.supabase.co',
          supabaseKey: 'fake-anon-key',
        })

        await manager.checkOnStartup('stable')

        delete require.cache[require.resolve('../../desktop/services/update-manager.cjs')]
      } finally {
        restore()
      }

      // The stable channel + mandatory policy should trigger install
      expect(autoUpdater.quitAndInstallCalled).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
