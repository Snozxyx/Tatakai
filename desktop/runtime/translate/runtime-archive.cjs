'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const tar = require('tar');
const contained = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** Extract files before links; publisher library links can reference later links. */
async function extractRuntimeArchive(archive, root, maxBytes = 512 * 1024 * 1024) {
  root = await fs.realpath(root);
  const links = [];
  let total = 0;
  let invalid = null;
  await tar.x({ file: archive, cwd: root, strict: true, filter(name, entry) {
    if (invalid) return false;
    try {
    const destination = path.resolve(root, name);
    if (!contained(root, destination) || path.isAbsolute(name) || name.includes('\\')) throw Error('Unsafe runtime archive path');
    total += Number(entry.size || 0);
    if (total > maxBytes) throw Error('Runtime expands beyond its size limit');
    if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
      const target = entry.type === 'Link' ? path.resolve(root, entry.linkpath) : path.resolve(path.dirname(destination), entry.linkpath);
      if (!contained(root, target) || links.length >= 512) throw Error('Unsafe runtime archive link');
      links.push({ destination, target, hard: entry.type === 'Link' });
      return false;
    }
    return ['File', 'Directory'].includes(entry.type);
    } catch (error) { invalid = error; return false; }
  } });
  if (invalid) throw invalid;
  let pending = links;
  while (pending.length) {
    const next = [];
    for (const link of pending) {
      const target = await fs.realpath(link.target).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!target) { next.push(link); continue; }
      if (!contained(root, target)) throw Error('Unsafe runtime archive link');
      await fs.mkdir(path.dirname(link.destination), { recursive: true });
      const parent = await fs.realpath(path.dirname(link.destination));
      if (!contained(root, parent)) throw Error('Unsafe runtime archive link parent');
      if (link.hard) await fs.link(target, link.destination);
      else await fs.symlink(path.relative(parent, target), link.destination);
    }
    if (next.length === pending.length) throw Error('Runtime archive contains unresolved or cyclic links');
    pending = next;
  }
}
module.exports = { extractRuntimeArchive };
