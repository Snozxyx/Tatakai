// Regenerate the runtime lock from immutable Git blobs, never checkout line endings.
// Usage: node scripts/lock-cloudstream-runtime.mjs <SkyStream checkout> [commit]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
const checkout = process.argv[2];
if (!checkout) throw Error('Pass the reference checkout path');
const git = args => execFileSync('git', ['-C', checkout, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const commit = git(['rev-parse', process.argv[3] || 'HEAD']).toString().trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid Git commit');
const directory = 'packages/cs3_engine/assets/engine';
const sha = data => createHash('sha256').update(data).digest('hex');
const names = git(['ls-tree', '--name-only', `${commit}:${directory}`]).toString().trim().split('\n').filter(name => name.endsWith('.jar')).sort();
if (!names.length) throw Error('No engine artifacts at this commit');
const files = names.map(name => { const data = git(['show', `${commit}:${directory}/${name}`]); return { name, bytes: data.length, sha256: sha(data) }; });
const lock = { repository: 'https://github.com/akashdh11/skystream', commit, license: 'GPL-3.0', files, licenseSha256: sha(git(['show', `${commit}:packages/cs3_engine/LICENSE`])) };
await fs.writeFile('desktop/runtime/compatibility/skystream-artifacts.json', JSON.stringify(lock, null, 2) + '\n');
console.log(`Pinned ${files.length} original JARs and exact upstream license bytes at ${commit}`);
