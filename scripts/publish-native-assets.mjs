// Tagged releases use their own draft assets rather than duplicate multi-GB
// installers in Actions artifact storage. The final job publishes the draft.
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tag = process.env.GITHUB_REF_NAME;
const repo = process.env.GITHUB_REPOSITORY;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (tag !== `v${version}` || !repo) {
  throw new Error('Release identity does not match package version');
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gh(args, { optional = false, retries = 1, backoffMs = 3000 } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    const r = spawnSync('gh', args, { encoding: 'utf8' });
    if (r.status === 0) return true;
    const err = (r.stderr || r.stdout || '').trim();
    if (attempt >= retries) {
      if (!optional) {
        throw new Error(err || 'GitHub release operation failed');
      }
      return false;
    }
    console.warn(`[gh retry ${attempt}/${retries}] ${args.slice(0, 3).join(' ')} failed: ${err.split('\n')[0]}`);
    console.warn(`Waiting ${backoffMs / 1000}s before retrying...`);
    await delay(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30000);
  }
}

if (!await gh(['release', 'view', tag, '--repo', repo], { optional: true, retries: 3, backoffMs: 2000 })) {
  const dir = mkdtempSync(join(tmpdir(), 'tatakai-release-'));
  try {
    const notes = join(dir, 'notes.md');
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const start = changelog.indexOf(`## [${version}]`);
    const end = changelog.indexOf('\n## [', start + 1);
    if (start < 0) throw new Error('Release changelog missing');
    writeFileSync(notes, changelog.slice(start, end < 0 ? undefined : end));
    if (!await gh(['release', 'create', tag, '--repo', repo, '--draft', '--target', process.env.GITHUB_SHA, '--title', `Tatakai ${version}`, '--notes-file', notes], { optional: true, retries: 3, backoffMs: 3000 })) {
      await gh(['release', 'view', tag, '--repo', repo], { retries: 5, backoffMs: 2000 });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const component = process.argv[2];
const files = component === 'desktop'
  ? readdirSync('dist_electron').filter(n => /\.(exe|dmg|zip|AppImage|deb|blockmap)$/.test(n) || /^latest(?:-[a-z]+)?\.yml$/.test(n)).map(n => 'dist_electron/' + n)
  : readdirSync('.').filter(n => n.startsWith(`Tatakai-v${version}-`) && (component === 'android' ? /-android(?:-tv)?\.apk$/.test(n) : /-ios-unsigned\.ipa$/.test(n)));

if (!files.length) throw new Error('No native release files');

// Upload files individually with retry to survive transient GitHub 500/502/503 upload errors.
for (const file of files) {
  let sizeStr = '';
  try {
    sizeStr = ` (${(statSync(file).size / (1024 * 1024)).toFixed(2)} MB)`;
  } catch {}
  console.log(`Uploading ${file}${sizeStr} to release ${tag}...`);
  await gh(['release', 'upload', tag, '--repo', repo, '--clobber', file], { retries: 5, backoffMs: 5000 });
}
console.log(`Successfully uploaded ${files.length} file(s) for ${component}.`);
