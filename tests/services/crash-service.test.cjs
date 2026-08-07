'use strict'

/**
 * Tests for CrashService — task 6.1
 *
 * Covers:
 *   - start() calls crashReporter.start with productName 'Tatakai' (Req 2.1)
 *   - start() passes submitURL and uploadToServer when DSN is provided (Req 2.2)
 *   - start() uses uploadToServer: false and empty submitURL when DSN is falsy (Req 2.6)
 *   - start() logs a console.warn when DSN is falsy (Req 2.6)
 *   - start() still calls crashReporter.start in local-only mode (Req 2.6)
 *   - module exports createCrashService factory
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test')

const { createCrashService } = require('../../desktop/services/crash-service.cjs')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a minimal mock crashReporter that records calls to start().
 */
function makeMockCrashReporter() {
  const calls = []
  return {
    calls,
    start(opts) {
      calls.push({ ...opts })
    },
    getLastCrashReport() {
      return null
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createCrashService', () => {
  it('exports a createCrashService factory function', () => {
    expect(typeof createCrashService).toBe('function')
  })

  it('returns an object with a start() method', () => {
    const svc = createCrashService({ crashReporter: makeMockCrashReporter() })
    expect(typeof svc.start).toBe('function')
  })
})

describe('CrashService.start() — with DSN', () => {
  it('calls crashReporter.start once (Req 2.1)', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: 'https://sentry.example.com/dsn', uploadToServer: true })

    expect(mock.calls.length).toBe(1)
  })

  it('passes productName "Tatakai" (Req 2.1)', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: 'https://sentry.example.com/dsn', uploadToServer: true })

    expect(mock.calls[0].productName).toBe('Tatakai')
  })

  it('passes submitURL equal to the provided DSN (Req 2.2)', () => {
    const dsn = 'https://sentry.example.com/dsn'
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn, uploadToServer: true })

    expect(mock.calls[0].submitURL).toBe(dsn)
  })

  it('passes uploadToServer: true when caller sets it to true (Req 2.2)', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: 'https://sentry.example.com/dsn', uploadToServer: true })

    expect(mock.calls[0].uploadToServer).toBe(true)
  })

  it('passes uploadToServer: false when caller sets it to false (Req 2.2)', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: 'https://sentry.example.com/dsn', uploadToServer: false })

    expect(mock.calls[0].uploadToServer).toBe(false)
  })
})

describe('CrashService.start() — without DSN (local-only mode, Req 2.6)', () => {
  let warnSpy
  let warnMessages

  beforeEach(() => {
    warnMessages = []
    warnSpy = console.warn
    console.warn = (...args) => {
      warnMessages.push(args.join(' '))
    }
  })

  afterEach(() => {
    console.warn = warnSpy
  })

  it('still calls crashReporter.start when DSN is undefined', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ uploadToServer: true })

    expect(mock.calls.length).toBe(1)
  })

  it('still calls crashReporter.start when DSN is an empty string', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: '', uploadToServer: true })

    expect(mock.calls.length).toBe(1)
  })

  it('sets productName to "Tatakai" in local-only mode', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({})

    expect(mock.calls[0].productName).toBe('Tatakai')
  })

  it('sets uploadToServer: false in local-only mode', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({})

    expect(mock.calls[0].uploadToServer).toBe(false)
  })

  it('logs a console.warn when DSN is missing', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({})

    const warned = warnMessages.some((m) => m.includes('No Sentry DSN'))
    expect(warned).toBe(true)
  })

  it('logs a console.warn when DSN is null', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    svc.start({ dsn: null })

    const warned = warnMessages.some((m) => m.includes('No Sentry DSN'))
    expect(warned).toBe(true)
  })

  it('does NOT pass the caller uploadToServer: true to crashReporter when DSN is missing', () => {
    const mock = makeMockCrashReporter()
    const svc = createCrashService({ crashReporter: mock })

    // Caller set uploadToServer: true, but no DSN — must be overridden to false.
    svc.start({ dsn: undefined, uploadToServer: true })

    expect(mock.calls[0].uploadToServer).toBe(false)
  })
})
