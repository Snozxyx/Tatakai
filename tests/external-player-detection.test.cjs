const { test, expect } = require('bun:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ installed = [], env = {}, registry = {}, pathResults = {} } = {}) {
    const calls = [];
    const launches = [];
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../desktop/services/external-player.cjs'), 'utf8'), {
        module, process: { platform: 'win32', env },
        require(id) {
            if (id !== 'child_process') return require(id);
            return {
                spawn(executable, args, options) { launches.push({ executable, args, options }); return { pid: 100, unref() {} }; },
                execFile(command, args, options, callback) {
                    calls.push({ command, args, options });
                    const result = path.win32.basename(command) === 'reg.exe' ? registry[args[1]] : pathResults[args[0]];
                    if (result === undefined) callback(new Error('Not found'));
                    else callback(null, { stdout: result });
                },
            };
        },
    });
    const mockFs = { promises: { access: async executable => {
        if (!installed.includes(executable)) throw new Error('Not found');
    } } };
    return { detect: async () => {
        const result = await module.exports.detectExternalPlayers(mockFs);
        expect(launches.length).toBe(0);
        return result;
    }, launch: module.exports.launchExternalPlayer, calls, launches };
}

test('detects MPC-HC bundled with K-Lite and MPC-BE installed outside C:', async () => {
    const hc = 'D:\\Applications\\K-Lite Codec Pack\\MPC-HC64\\mpc-hc64.exe';
    const be = 'D:\\Applications\\MPC-BE\\mpc-be64.exe';
    const { detect } = setup({ env: { ProgramFiles: 'D:\\Applications' }, installed: [hc, be] });
    const players = await detect();
    expect(players.find(player => player.id === 'mpc-hc')?.executablePath).toBe(hc);
    expect(players.find(player => player.id === 'mpc-be')?.executablePath).toBe(be);
});

test('detects per-user MPC installs without requiring a PATH entry', async () => {
    const executable = 'C:\\Users\\Viewer\\AppData\\Local\\Programs\\MPC-HC\\mpc-hc64.exe';
    const { detect } = setup({ env: { LOCALAPPDATA: 'C:\\Users\\Viewer\\AppData\\Local' }, installed: [executable] });
    expect((await detect()).find(player => player.id === 'mpc-hc')?.executablePath).toBe(executable);
});

test('detects registered nonstandard installs and expands quoted registry paths', async () => {
    const executable = 'E:\\Media Apps\\MPC-BE\\mpc-be64.exe';
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\mpc-be64.exe';
    const { detect, calls } = setup({
        env: { PLAYER_ROOT: 'E:\\Media Apps' }, installed: [executable],
        registry: { [key]: `${key}\r\n    (Default)    REG_EXPAND_SZ    "%player_root%\\MPC-BE\\mpc-be64.exe"\r\n` },
    });
    expect((await detect()).find(player => player.id === 'mpc-be')?.executablePath).toBe(executable);
    expect(calls.every(call => call.options.windowsHide === true)).toBe(true);
    expect(calls.filter(call => path.win32.basename(call.command) === 'reg.exe').every(call => path.win32.isAbsolute(call.command))).toBe(true);
});

test('custom Windows player paths retain their player arguments regardless of executable case', () => {
    const { launch, launches } = setup();
    const executable = 'E:\\Portable Apps\\MPC-HC64.EXE';
    const result = launch(executable, 'https://media.example/episode.mp4', {}, { info() {}, error() {} });
    expect(result.player).toBe('MPC-HC');
    expect(launches[0].executable).toBe(executable);
    expect(Array.from(launches[0].args)).toEqual(['https://media.example/episode.mp4', '/play']);
});

test('ignores removed registry installs and continues with PATH fallback', async () => {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\mpc-hc64.exe';
    const executable = 'E:\\Portable\\mpc-hc64.exe';
    const { detect } = setup({
        registry: { [key]: `    (Default)    REG_SZ    E:\\Removed\\mpc-hc64.exe\r\n` },
        pathResults: { 'mpc-hc64.exe': `${executable}\r\nE:\\Other\\mpc-hc64.exe\r\n` },
    });
    const players = await detect();
    expect(players.length).toBe(1);
    expect(players[0].executablePath).toBe(executable);
});
