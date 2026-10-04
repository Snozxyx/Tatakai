const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const semver = require('semver')

function setup(platform, version = '6.0.4', policyType = 'mandatory') {
  const events = []
  const handlers = {}
  const calls = { checks: 0, downloads: 0, installs: 0, policies: 0 }
  const updater = new EventEmitter()
  updater.setFeedURL = () => {}
  updater.checkForUpdates = async () => {
    calls.checks++
    const info = { version }
    updater.emit(semver.gt(version, '6.0.3') ? 'update-available' : 'update-not-available', info)
    return { updateInfo: info }
  }
  updater.downloadUpdate = async () => {
    calls.downloads++
    updater.emit('update-downloaded', { version })
  }
  updater.quitAndInstall = () => { calls.installs++ }
  const query = {
    from() { calls.policies++; return this },
    select() { return this },
    eq() { return this },
    limit() { return this },
    async single() {
      return { data: { type: policyType, target_version: version, channel: 'stable' } }
    },
  }
  const module = { exports: {} }
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../../desktop/services/update-manager.cjs'), 'utf8'),
    {
      module,
      console,
      process: { platform },
      require(id) {
        if (id === '@supabase/supabase-js') return { createClient: () => query }
        if (id === 'electron') {
          return {
            BrowserWindow: {
              getAllWindows: () => [{
                isDestroyed: () => false,
                webContents: { send: (_, event) => events.push(event) },
              }],
            },
          }
        }
        if (id === 'fs') {
          return {
            existsSync: () => true,
            readFileSync: () => '[]',
            writeFileSync() {},
          }
        }
        return require(id)
      },
    },
  )
  const manager = module.exports.createUpdateManager({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn } },
    autoUpdater: updater,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    app: { isPackaged: true, getVersion: () => '6.0.3', getPath: () => '/unused' },
    supabaseUrl: 'https://example.invalid',
    supabaseKey: 'test',
  })
  return { manager, updater, events, handlers, calls }
}

test('macOS announces a newer version as manual and skips mandatory policy installation', async () => {
  const s = setup('darwin')
  await s.manager.checkOnStartup('stable')
  assert.equal(s.events.find((event) => event.type === 'available').manual, true)
  assert.deepEqual(s.calls, { checks: 1, downloads: 0, installs: 0, policies: 0 })
  assert.equal(s.updater.autoDownload, false)
  assert.equal(s.updater.autoInstallOnAppQuit, false)
})

test('macOS manual checks work; download, install and rollback cannot bypass the guard', async () => {
  const s = setup('darwin')
  await s.handlers['update:check'](null, 'stable')
  assert.equal(s.calls.checks, 1)
  for (const action of ['update:download', 'update:install', 'update:rollback']) {
    assert.match((await s.handlers[action](null, '6.0.2')).error, /manually/)
  }
  await assert.rejects(s.manager.rollbackTo('6.0.2'), /manually/)
  assert.equal(s.calls.downloads, 0)
  assert.equal(s.calls.installs, 0)
})

test('same-version macOS rebuild does not announce an available update', async () => {
  const s = setup('darwin', '6.0.3')
  await s.manager.checkOnStartup('stable')
  assert.equal(s.events.some((event) => event.type === 'available'), false)
  assert.equal(s.events.some((event) => event.type === 'not-available'), true)
})

for (const platform of ['win32', 'linux']) {
  test(`${platform} retains mandatory download and installation behavior`, async () => {
    const s = setup(platform)
    await s.manager.checkOnStartup('stable')
    assert.equal(s.events.find((event) => event.type === 'available').manual, false)
    assert.equal(s.calls.policies, 1)
    assert.equal(s.calls.downloads, 1)
    assert.equal(s.calls.installs, 1)
    assert.equal(s.updater.autoInstallOnAppQuit, true)
  })
}
