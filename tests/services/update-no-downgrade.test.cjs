const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const semver = require('semver')

function setup(t, offered, policy = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-update-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const current = '6.4.3-beta.1'
  const events = [], handlers = {}, checks = []
  const updater = new EventEmitter()
  // Match electron-updater's documented side effect, absent in ordinary mocks.
  Object.defineProperty(updater, 'channel', {
    set(value) { this._channel = value; this.allowDowngrade = true },
    get() { return this._channel },
  })
  updater.setFeedURL = () => {}
  updater.checkForUpdates = async () => {
    checks.push({ channel: updater.channel, allowDowngrade: updater.allowDowngrade })
    const available = semver.gt(offered, current) || (updater.allowDowngrade && semver.lt(offered, current))
    const info = { version: offered }
    updater.emit(available ? 'update-available' : 'update-not-available', info)
    return { updateInfo: info }
  }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../desktop/services/update-manager.cjs'), 'utf8'), {
    module, console, process: { platform: 'win32' },
    require(id) {
      if (id === 'electron') return { BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (_, event) => events.push(event) } }] } }
      if (id === '@supabase/supabase-js') return { createClient: () => ({ rpc: async () => ({ data: policy }) }) }
      return require(id)
    },
  })
  const manager = module.exports.createUpdateManager({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn } }, autoUpdater: updater,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    app: { isPackaged: true, getVersion: () => current, getPath: () => dir },
    supabaseUrl: 'https://example.invalid', supabaseKey: 'test',
  })
  return { manager, checks, events }
}

for (const channel of ['stable', 'beta']) {
  test(`${channel} never offers 6.4.2 to installed 6.4.3 beta`, async t => {
    const s = setup(t, '6.4.2')
    await s.manager.checkOnStartup(channel)
    assert.equal(s.checks[0].allowDowngrade, false)
    assert.equal(s.events.some(e => e.type === 'available'), false)
  })
}
test('switching from beta to stable keeps downgrade protection', async t => {
  const s = setup(t, '6.4.2')
  await s.manager.checkOnStartup('beta')
  await s.manager.checkOnStartup('stable')
  assert.equal(s.checks.length, 2)
  assert.ok(s.checks.every(check => check.allowDowngrade === false))
})
test('device-scoped policy cannot re-enable downgrade through its channel setter', async t => {
  const s = setup(t, '6.4.2', { type: 'recommended', target_version: '6.4.2', channel: 'stable', platform: 'windows' })
  await s.manager.checkOnStartup('stable')
  assert.equal(s.checks[0].allowDowngrade, false)
  assert.equal(s.events.some(e => e.type === 'available'), false)
})
for (const offered of ['6.4.3-beta.2', '6.4.3']) {
  test(`genuine upgrade ${offered} remains available`, async t => {
    const s = setup(t, offered)
    await s.manager.checkOnStartup(offered.includes('beta') ? 'beta' : 'stable')
    assert.ok(s.events.some(e => e.type === 'available'))
  })
}
