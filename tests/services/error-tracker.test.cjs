'use strict'

/**
 * Tests for ErrorTracker
 *
 * Covers:
 *   - Sensitive data scrubbing — strips filesystem paths and JWTs (Req 3.4, 9.1)
 *   - Telemetry consent gate — captureException/captureMessage no-op when disabled (Req 3.5, 9.2)
 *   - init() no-op when DSN is falsy (Req 3.1)
 *   - _isTelemetryEnabled() reads settings.json correctly
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { createErrorTracker } = require('../../desktop/services/error-tracker.cjs')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'error-tracker-test-'))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ErrorTracker — sensitive data scrubbing (Req 3.4, 9.1)', () => {
  let tracker

  beforeEach(() => {
    tracker = createErrorTracker()
  })

  it('strips Windows absolute paths from event data', () => {
    const event = { message: 'Failed at C:\\Users\\Alice\\AppData\\file.log' }
    const scrubbed = tracker._scrubSensitiveData(event)
    expect(JSON.stringify(scrubbed)).not.toContain('C:\\Users')
    expect(JSON.stringify(scrubbed)).toContain('[SCRUBBED_PATH]')
  })

  it('strips Unix absolute paths from event data', () => {
    const event = { message: 'Error in /home/user/app/config.json' }
    const scrubbed = tracker._scrubSensitiveData(event)
    expect(JSON.stringify(scrubbed)).not.toContain('/home/user')
    expect(JSON.stringify(scrubbed)).toContain('[SCRUBBED_PATH]')
  })

  it('strips JWT tokens from event data', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'
    const event = { message: `Unauthorized: ${jwt}` }
    const scrubbed = tracker._scrubSensitiveData(event)
    expect(JSON.stringify(scrubbed)).not.toContain('eyJhbGci')
    expect(JSON.stringify(scrubbed)).toContain('[SCRUBBED_JWT]')
  })

  it('strips multiple sensitive items in one event', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0'
    const event = {
      message: `Path /etc/passwd and token ${jwt}`,
      extra: { file: 'C:\\Windows\\System32\\drivers\\etc\\hosts' },
    }
    const scrubbed = tracker._scrubSensitiveData(event)
    const serialised = JSON.stringify(scrubbed)
    expect(serialised).not.toContain('/etc/passwd')
    expect(serialised).not.toContain('eyJhbGci')
    expect(serialised).not.toContain('C:\\Windows')
  })

  it('leaves non-sensitive data untouched', () => {
    const event = { message: 'Normal error', code: 42, flag: true }
    const scrubbed = tracker._scrubSensitiveData(event)
    expect(scrubbed.message).toBe('Normal error')
    expect(scrubbed.code).toBe(42)
    expect(scrubbed.flag).toBe(true)
  })

  it('handles null/undefined input gracefully', () => {
    expect(() => tracker._scrubSensitiveData(null)).not.toThrow()
    expect(() => tracker._scrubSensitiveData(undefined)).not.toThrow()
  })

  it('_beforeSend returns scrubbed event', () => {
    const event = { message: 'Crash at /var/app/main.js' }
    const result = tracker._beforeSend(event)
    expect(JSON.stringify(result)).not.toContain('/var/app/main.js')
  })
})

describe('ErrorTracker — telemetry consent gate (Req 3.5, 9.2)', () => {
  let tmpDir
  let tracker

  beforeEach(() => {
    tmpDir = makeTmpDir()
    tracker = createErrorTracker({ userDataPath: tmpDir })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('_isTelemetryEnabled() returns true when settings.json does not exist', () => {
    expect(tracker._isTelemetryEnabled()).toBe(true)
  })

  it('_isTelemetryEnabled() returns true when settings.json has telemetry: true', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ telemetry: true }), 'utf8')
    expect(tracker._isTelemetryEnabled()).toBe(true)
  })

  it('_isTelemetryEnabled() returns false when settings.json has telemetry: false', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ telemetry: false }), 'utf8')
    expect(tracker._isTelemetryEnabled()).toBe(false)
  })

  it('_isTelemetryEnabled() returns true when settings.json has unrelated keys', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ theme: 'dark' }), 'utf8')
    expect(tracker._isTelemetryEnabled()).toBe(true)
  })

  it('_isTelemetryEnabled() returns true when settings.json is malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), 'not valid json', 'utf8')
    expect(tracker._isTelemetryEnabled()).toBe(true)
  })

  it('captureException is a no-op before init()', () => {
    // Should not throw even without Sentry initialised
    expect(() => tracker.captureException(new Error('test'))).not.toThrow()
  })

  it('captureMessage is a no-op before init()', () => {
    expect(() => tracker.captureMessage('test msg', 'info')).not.toThrow()
  })

  it('setUser is a no-op before init()', () => {
    expect(() => tracker.setUser({ id: '123' })).not.toThrow()
    expect(() => tracker.setUser(null)).not.toThrow()
  })

  it('addBreadcrumb is a no-op before init()', () => {
    expect(() => tracker.addBreadcrumb({ category: 'ui', message: 'click', level: 'info' })).not.toThrow()
  })
})

describe('ErrorTracker — init() with falsy DSN (Req 3.1)', () => {
  it('init() does not throw when DSN is empty string', () => {
    const tracker = createErrorTracker()
    expect(() => tracker.init({ dsn: '', release: '1.0.0', environment: 'test' })).not.toThrow()
  })

  it('init() does not throw when DSN is null', () => {
    const tracker = createErrorTracker()
    expect(() => tracker.init({ dsn: null, release: '1.0.0', environment: 'test' })).not.toThrow()
  })

  it('init() does not throw when DSN is undefined', () => {
    const tracker = createErrorTracker()
    expect(() => tracker.init({ release: '1.0.0', environment: 'test' })).not.toThrow()
  })
})

describe('ErrorTracker — factory and exports', () => {
  it('createErrorTracker() returns an object with all public methods', () => {
    const tracker = createErrorTracker()
    expect(typeof tracker.init).toBe('function')
    expect(typeof tracker.captureException).toBe('function')
    expect(typeof tracker.captureMessage).toBe('function')
    expect(typeof tracker.setUser).toBe('function')
    expect(typeof tracker.addBreadcrumb).toBe('function')
  })

  it('module exports createErrorTracker', () => {
    const mod = require('../../desktop/services/error-tracker.cjs')
    expect(typeof mod.createErrorTracker).toBe('function')
  })
})

// ─── Property-Based Tests ─────────────────────────────────────────────────────

const fc = require('fast-check')

/**
 * Property 6: Telemetry Consent Gate
 * Validates: Requirements 3.5, 9.2
 *
 * For any arbitrary sequence of captureException / captureMessage calls,
 * if settings.json has `telemetry: false`, the mock Sentry transport must
 * receive zero transmissions.
 */
describe('Property 6: Telemetry Consent Gate (Req 3.5, 9.2)', () => {
  it('zero transmissions when telemetry is disabled, for any capture sequence', () => {
    // Arbitrary sequences of capture calls
    const captureCallArb = fc.array(
      fc.record({
        type: fc.constantFrom('exception', 'message'),
        data: fc.string({ maxLength: 50 }),
      }),
      { minLength: 0, maxLength: 20 }
    )

    fc.assert(
      fc.property(captureCallArb, (calls) => {
        // Set up temp dir with telemetry: false
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-consent-'))
        try {
          fs.writeFileSync(
            path.join(tmpDir, 'settings.json'),
            JSON.stringify({ telemetry: false }),
            'utf8'
          )

          // Track whether any Sentry capture methods were invoked
          let captureCount = 0
          const mockSentry = {
            init: () => {},
            captureException: () => { captureCount++ },
            captureMessage: () => { captureCount++ },
            withScope: (cb) => { captureCount++; cb({ setExtras: () => {} }) },
            setUser: () => {},
            addBreadcrumb: () => {},
          }

          // Inject mock Sentry into the module cache so require('@sentry/node')
          // returns our mock when createErrorTracker lazily requires it
          const sentryModuleId = require.resolve('@sentry/node')
          const originalModule = require.cache[sentryModuleId]
          require.cache[sentryModuleId] = {
            id: sentryModuleId,
            filename: sentryModuleId,
            loaded: true,
            exports: mockSentry,
            parent: null,
            children: [],
            paths: [],
          }

          try {
            const tracker = createErrorTracker({ userDataPath: tmpDir })
            // init() with a fake DSN — mock Sentry.init won't throw
            tracker.init({ dsn: 'https://fake@sentry.io/123', release: '1.0.0', environment: 'test' })

            // Execute the arbitrary capture sequence
            for (const call of calls) {
              if (call.type === 'exception') {
                tracker.captureException(new Error(call.data))
              } else {
                tracker.captureMessage(call.data, 'info')
              }
            }

            // Assert: consent gate blocked all transmissions
            expect(captureCount).toBe(0)
          } finally {
            // Restore original Sentry module (or remove mock if it wasn't there before)
            if (originalModule) {
              require.cache[sentryModuleId] = originalModule
            } else {
              delete require.cache[sentryModuleId]
            }
          }
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true })
        }
      }),
      { numRuns: 30 }
    )
  })
})

/**
 * Property 11: Sentry Sensitive Data Scrubbing
 * Validates: Requirements 3.4, 9.1
 *
 * For any error message string with injected filesystem paths and JWT tokens,
 * the _beforeSend hook must strip all injected sensitive values.
 */
describe('Property 11: Sentry Sensitive Data Scrubbing (Req 3.4, 9.1)', () => {
  it('beforeSend strips all injected paths and JWT tokens from event data', () => {
    // Arbitraries for sensitive data injection

    // Unix-style path: /home/<slug>/secret.txt
    const unixPathArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)) // only safe chars for path segments
      .map((s) => `/home/${s}/secret.txt`)

    // Windows-style path: C:\Users\<slug>\file.dat
    const winPathArb = fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))
      .map((s) => `C:\\Users\\${s}\\file.dat`)

    // JWT token: ey<base64url>.<base64url>.sig  (segments ≥ 10 chars each to match RE_JWT)
    // Use fc.array of chars then join, since fc.stringOf is not available in this build
    const base64urlCharArb = fc.constantFrom(
      ...('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-').split('')
    )
    const base64urlSegArb = fc
      .array(base64urlCharArb, { minLength: 10, maxLength: 30 })
      .map((chars) => chars.join(''))
    const jwtArb = fc
      .tuple(base64urlSegArb, base64urlSegArb)
      .map(([h, p]) => `ey${h}.ey${p}.sig`)

    // Arbitrary base message string (no sensitive data injected here)
    const baseMessageArb = fc.string({ minLength: 0, maxLength: 100 })

    fc.assert(
      fc.property(
        baseMessageArb,
        fc.array(unixPathArb, { minLength: 0, maxLength: 3 }),
        fc.array(winPathArb, { minLength: 0, maxLength: 3 }),
        fc.array(jwtArb, { minLength: 0, maxLength: 3 }),
        (baseMsg, unixPaths, winPaths, jwts) => {
          const tracker = createErrorTracker()

          // Build an error message containing all the sensitive items
          const allSensitive = [...unixPaths, ...winPaths, ...jwts]
          const fullMessage = [baseMsg, ...allSensitive].join(' | ')

          const event = {
            message: fullMessage,
            exception: {
              values: [
                {
                  type: 'Error',
                  value: fullMessage,
                },
              ],
            },
          }

          const scrubbed = tracker._beforeSend(event)
          const serialised = JSON.stringify(scrubbed)

          // Assert none of the injected sensitive values appear in the output
          for (const sensitiveValue of allSensitive) {
            expect(serialised).not.toContain(sensitiveValue)
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
