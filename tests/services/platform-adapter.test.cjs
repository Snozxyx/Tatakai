'use strict'

/**
 * Tests for PlatformAdapter — Property 8
 *
 * **Property 8: PlatformAdapter.notify() Never Throws**
 *
 * For any combination of { title, body, urgency } inputs, including when
 * Electron's Notification.show() randomly throws, calling notify() must
 * never propagate an exception to the caller.
 *
 * **Validates: Requirements 6.10**
 */

const { describe, it, expect } = require('bun:test')
const fc = require('fast-check')

// ─── Mock Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a mock Notification class where show() may or may not throw.
 * @param {boolean} shouldThrow - When true, show() throws an error.
 */
function makeMockNotification(shouldThrow) {
  return class MockNotification {
    constructor(_opts) {
      // No-op constructor — accept any options
    }
    show() {
      if (shouldThrow) {
        throw new Error('MockNotification: show() failed intentionally')
      }
    }
    static isSupported() {
      return true
    }
  }
}

/**
 * Builds a mock `app` object that satisfies PlatformAdapter's constructor needs.
 */
const mockApp = {
  setAppUserModelId: () => {},
  setAsDefaultProtocolClient: () => {},
  dock: { setBadge: () => {}, bounce: () => {} },
  isReady: () => true,
}

/**
 * Builds a mock `BrowserWindow` that satisfies PlatformAdapter's constructor needs.
 */
const mockBrowserWindow = {
  getAllWindows: () => [],
  flashFrame: () => {},
  getFocusedWindow: () => null,
}

/**
 * Builds a mock logger that silently absorbs all log calls.
 */
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
}

/**
 * Installs a mocked electron module into the require cache and returns the
 * PlatformAdapter factory. The mock Notification class is configured to either
 * succeed or throw on show(), based on `shouldThrow`.
 *
 * We inject into require.cache BEFORE requiring platform-adapter so that the
 * lazy `require('electron')` inside notify() picks up the mock.
 *
 * @param {boolean} shouldThrow
 * @returns {{ createPlatformAdapter: Function }}
 */
function requireAdapterWithMock(shouldThrow) {
  const electronResolved = require.resolve('electron')
  const adapterResolved = require.resolve('../../desktop/services/platform-adapter.cjs')

  // Inject mock electron into the require cache
  require.cache[electronResolved] = {
    id: electronResolved,
    filename: electronResolved,
    loaded: true,
    exports: {
      Notification: makeMockNotification(shouldThrow),
      app: mockApp,
      BrowserWindow: mockBrowserWindow,
    },
  }

  // Remove platform-adapter from cache so it picks up the fresh electron mock
  delete require.cache[adapterResolved]

  return require('../../desktop/services/platform-adapter.cjs')
}

/**
 * Cleanup: remove both electron mock and platform-adapter from require cache
 * so subsequent tests start clean.
 */
function cleanupRequireCache() {
  try {
    const electronResolved = require.resolve('electron')
    delete require.cache[electronResolved]
  } catch (_) {}
  try {
    const adapterResolved = require.resolve('../../desktop/services/platform-adapter.cjs')
    delete require.cache[adapterResolved]
  } catch (_) {}
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('PlatformAdapter.notify() — never throws (unit examples, Req 6.10)', () => {
  it('does not throw when Notification.show() succeeds', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(false)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: 'Hello', body: 'World', urgency: 'normal' })
    }).not.toThrow()

    cleanupRequireCache()
  })

  it('does not throw when Notification.show() throws', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(true)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: 'Hello', body: 'World', urgency: 'normal' })
    }).not.toThrow()

    cleanupRequireCache()
  })

  it('does not throw for urgency: critical', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(true)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: 'Critical!', body: 'Urgent message', urgency: 'critical' })
    }).not.toThrow()

    cleanupRequireCache()
  })

  it('does not throw for urgency: low', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(true)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: 'Low', body: 'Low urgency', urgency: 'low' })
    }).not.toThrow()

    cleanupRequireCache()
  })

  it('does not throw with empty title and body', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(true)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: '', body: '' })
    }).not.toThrow()

    cleanupRequireCache()
  })

  it('does not throw when urgency is undefined', () => {
    const { createPlatformAdapter } = requireAdapterWithMock(true)
    const adapter = createPlatformAdapter({ app: mockApp, BrowserWindow: mockBrowserWindow, logger: mockLogger })

    expect(() => {
      adapter.notify({ title: 'No urgency', body: 'Defaults to normal' })
    }).not.toThrow()

    cleanupRequireCache()
  })
})

// ─── Property-Based Tests ─────────────────────────────────────────────────────

/**
 * Property 8: PlatformAdapter.notify() Never Throws
 * Validates: Requirements 6.10
 *
 * For ANY combination of { title, body, urgency } inputs — even when
 * Notification.show() throws randomly — notify() must never propagate an
 * unhandled exception to the caller.
 */
describe('PlatformAdapter.notify() — PBT: never throws for any input (Property 8)', () => {
  it('notify() does not throw for any { title, body, urgency } with randomly-throwing Notification', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ maxLength: 50 }),
          body: fc.string({ maxLength: 100 }),
          urgency: fc.constantFrom('low', 'normal', 'critical', undefined),
        }),
        fc.boolean(), // Whether Notification.show() throws
        (input, shouldThrow) => {
          const { createPlatformAdapter } = requireAdapterWithMock(shouldThrow)
          const adapter = createPlatformAdapter({
            app: mockApp,
            BrowserWindow: mockBrowserWindow,
            logger: mockLogger,
          })

          let threw = false
          try {
            adapter.notify(input)
          } catch (_err) {
            threw = true
          } finally {
            cleanupRequireCache()
          }

          // The property: notify() must NEVER throw, regardless of input or
          // whether the underlying Notification.show() fails.
          return threw === false
        }
      ),
      { numRuns: 50 }
    )
  })
})
