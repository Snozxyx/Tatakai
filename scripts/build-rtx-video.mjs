import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = process.argv.includes('--required');
if (process.platform !== 'win32' || process.arch !== 'x64') { console.log('RTX Video: Windows x64 native build only.'); process.exit(0); }
const sdk = path.resolve(process.env.RTX_VIDEO_SDK || path.join(root, '.cache/rtx-video-sdk'));
const exists = async file => fs.access(file).then(() => true, () => false);
if (!await exists(path.join(sdk, 'include/nvsdk_ngx_helpers_vsr.h'))) {
  console.log('RTX Video SDK not found. Extract the official SDK into .cache/rtx-video-sdk or set RTX_VIDEO_SDK. RTX will remain unavailable.');
  process.exit(required ? 1 : 0);
}
const toolchain = path.join(root, '.cache/rtx-toolchain');
const localMsvcRoot = path.join(toolchain, 'msvc/VC/Tools/MSVC');
const localVersions = await fs.readdir(localMsvcRoot).catch(() => []);
const msvc = process.env.VCToolsInstallDir || (localVersions.length ? path.join(localMsvcRoot, localVersions.sort().at(-1)) : null);
if (!msvc) throw new Error('Use a Visual Studio x64 Developer shell or run scripts/prepare-rtx-toolchain.py for a local compiler.');
const sdkRoot = process.env.WindowsSdkDir || path.join(toolchain, 'sdk/c');
const windowsVersions = await fs.readdir(path.join(sdkRoot, 'Include'));
const windowsVersion = process.env.WindowsSDKVersion?.replace(/[\\/]$/, '') || windowsVersions.sort().at(-1);
const include = path.join(root, '.cache/rtx-video-build/include');
await fs.mkdir(path.join(include, 'nlohmann'), { recursive: true });
const jsonHeader = path.join(include, 'nlohmann/json.hpp');
if (!await exists(jsonHeader)) {
  const response = await fetch('https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp');
  if (!response.ok) throw new Error('Could not acquire the pinned nlohmann/json header.');
  await fs.writeFile(jsonHeader, Buffer.from(await response.arrayBuffer()));
}
const headerHash = createHash('sha256').update(await fs.readFile(jsonHeader)).digest('hex');
if (headerHash !== '9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6') throw new Error('Pinned JSON header checksum mismatch.');
console.log(`nlohmann/json 3.11.3 header SHA256: ${headerHash}`);
const out = path.join(root, 'resources/bin/rtx-video');
await fs.mkdir(out, { recursive: true });
const source = path.join(root, 'desktop/runtime/rtx-video/native/main.cpp');
const libDirs = [path.join(msvc, 'lib/x64')];
for (const kind of ['ucrt', 'um']) {
  const versioned = path.join(sdkRoot, 'Lib', windowsVersion, kind, 'x64');
  libDirs.push(await exists(versioned) ? versioned : path.join(sdkRoot, kind, 'x64'));
}
const includes = [path.join(msvc, 'include'), ...['ucrt', 'shared', 'um', 'winrt'].map(kind => path.join(sdkRoot, 'Include', windowsVersion, kind)), path.join(sdk, 'include'), include];
const args = ['/nologo', '/std:c++17', '/EHsc', '/MT', '/O2', '/W4', ...includes.map(dir => `/I${dir}`), source, `/Fo${path.join(root, '.cache/rtx-video-build/main.obj')}`, `/Fe${path.join(out, 'tatakai-rtx-video.exe')}`, '/link', `/IMPLIB:${path.join(root, '.cache/rtx-video-build/native.lib')}`, ...libDirs.map(dir => `/LIBPATH:${dir}`), path.join(sdk, 'lib/Windows/x64/nvsdk_ngx_s.lib'), 'd3d11.lib', 'dxgi.lib', 'dxguid.lib', 'advapi32.lib', 'user32.lib', 'shell32.lib', 'ole32.lib', 'version.lib', 'wintrust.lib', 'crypt32.lib', 'shlwapi.lib'];
const compiler = path.join(msvc, 'bin/Hostx64/x64/cl.exe');
await new Promise((resolve, reject) => {
  const child = spawn(compiler, args, { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, PATH: `${path.dirname(compiler)};${process.env.PATH}` } });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`RTX helper compilation failed (${code})`)));
});
await fs.copyFile(path.join(sdk, 'bin/Windows/x64/rel/nvngx_vsr.dll'), path.join(out, 'nvngx_vsr.dll'));
await fs.copyFile(path.join(sdk, 'NVIDIA_RTX_Video_SDK_License.pdf'), path.join(out, 'NVIDIA_RTX_Video_SDK_License.pdf'));
for (const name of ['tatakai-rtx-video.lib', 'tatakai-rtx-video.exp']) await fs.rm(path.join(out, name), { force: true });
await fs.writeFile(path.join(out, 'THIRD_PARTY_NOTICES.txt'), `This software contains source code provided by NVIDIA Corporation.\nRTX Video SDK runtime: NVIDIA RTX SDKs License (included PDF).\nNVIDIA runtime binaries are unmodified and incorporated into Tatakai.\nnlohmann/json 3.11.3: Copyright (c) 2013-2023 Niels Lohmann, MIT License.\n`);
// Preserve the full MIT notice for the header-only JSON library incorporated in the helper.
const license = await fetch('https://raw.githubusercontent.com/nlohmann/json/v3.11.3/LICENSE.MIT');
if (!license.ok) throw new Error('Could not acquire the JSON library license.');
await fs.writeFile(path.join(out, 'nlohmann-json-LICENSE.MIT'), await license.text());
console.log(`RTX Video helper and licensed runtime staged in ${out}`);
