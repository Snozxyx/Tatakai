import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

export const RTX_SDK_TAG = 'ci-rtx-sdk-v1.1.0';
export const RTX_SDK_ARCHIVE = 'RTX_Video_SDK_v1.1.0.zip';
export const RTX_SDK_SHA256 = 'abf4f34e2b5a618e355b0d5a0365d8ecc3db4396e756e4c850a867e1ae2ed69e';
const REQUIRED = [
  'include/nvsdk_ngx_helpers_vsr.h',
  'lib/Windows/x64/nvsdk_ngx_s.lib',
  'bin/Windows/x64/rel/nvngx_vsr.dll',
  'NVIDIA_RTX_Video_SDK_License.pdf',
];

export function installVerifiedRtxSdk(archive, destination, expectedHash = RTX_SDK_SHA256) {
  const bytes = fs.readFileSync(archive);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('NVIDIA RTX SDK checksum mismatch');
  const zip = new AdmZip(bytes);
  const root = path.resolve(destination);
  let expanded = 0;
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    const target = path.resolve(root, name);
    const relative = path.relative(root, target);
    if (path.isAbsolute(name) || /^[a-z]:/i.test(name) || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error('Invalid NVIDIA RTX SDK archive path');
    }
    if (((entry.attr >>> 16) & 0o170000) === 0o120000) throw new Error('NVIDIA RTX SDK archive contains a symlink');
    expanded += entry.header.size;
    if (expanded > 256 * 1024 * 1024) throw new Error('NVIDIA RTX SDK archive exceeds its size limit');
  }
  const names = new Set(zip.getEntries().map(entry => entry.entryName.replace(/\\/g, '/')));
  if (REQUIRED.some(name => !names.has(name))) throw new Error('NVIDIA RTX SDK archive is incomplete');
  fs.mkdirSync(root, { recursive: true });
  zip.extractAllTo(root, true);
  for (const name of REQUIRED) if (!fs.statSync(path.join(root, name)).size) throw new Error('NVIDIA RTX SDK file is empty');
  return root;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const downloads = path.join(root, '.cache/rtx-sdk-download');
    fs.mkdirSync(downloads, { recursive: true });
    const repository = process.env.GITHUB_REPOSITORY || 'Snozxyx/Tatakai';
    const result = spawnSync('gh', ['release', 'download', RTX_SDK_TAG, '--repo', repository, '--pattern', RTX_SDK_ARCHIVE, '--dir', downloads, '--clobber'], { stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error('NVIDIA RTX SDK download failed');
    const sdk = installVerifiedRtxSdk(path.join(downloads, RTX_SDK_ARCHIVE), path.join(root, '.cache/rtx-video-sdk'));
    if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `RTX_VIDEO_SDK=${sdk}\n`, 'utf8');
    console.log('Verified and extracted NVIDIA RTX Video SDK 1.1.0 for Windows CI.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
