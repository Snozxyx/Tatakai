import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');

// Content hashes catch edits even when a checkout preserves file timestamps.
export function buildFingerprint(inputs, settings = {}) {
  const hash = createHash('sha256').update(JSON.stringify(settings));
  const visit = file => {
    hash.update(file);
    if (!existsSync(file)) { hash.update('missing'); return; }
    if (statSync(file).isDirectory()) {
      for (const name of readdirSync(file).sort()) visit(join(file, name));
    } else hash.update(digest(file));
  };
  for (const file of inputs) visit(file);
  return hash.digest('hex');
}

export function isBuildCurrent(stamp, fingerprint) {
  try {
    const saved = JSON.parse(readFileSync(stamp, 'utf8'));
    return saved.fingerprint === fingerprint && saved.outputs.length > 0 &&
      saved.outputs.every(({ file, hash }) => existsSync(file) && digest(file) === hash);
  } catch { return false; }
}

export function saveBuildStamp(stamp, fingerprint, outputs) {
  mkdirSync(dirname(stamp), { recursive: true });
  writeFileSync(stamp, JSON.stringify({ fingerprint, outputs: outputs.map(file => ({ file, hash: digest(file) })) }));
}
