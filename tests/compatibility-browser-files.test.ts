import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BrowserFiles } from '../desktop/runtime/compatibility/browser-files.cjs';

describe('private extension browser file capabilities', () => {
  it('serves files/cache only, rejects traversal and symlink escapes, and revokes access', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-browser-'));
    const data = path.join(root, 'data'), folder = path.join(data, 'files', 'page'), outside = path.join(root, 'outside');
    await mkdir(folder, { recursive: true }); await mkdir(outside);
    await writeFile(path.join(folder, 'index.html'), '<p>original extension page</p>');
    await writeFile(path.join(outside, 'secret.txt'), 'never served');
    await symlink(outside, path.join(folder, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const files = new BrowserFiles(data);
    try {
      await expect(files.register({ folder: outside, path: 'secret.txt' })).rejects.toThrow('outside');
      const lease = await files.register({ folder, path: 'index.html', file: 'file:///extension/' });
      const response = await fetch(lease.url);
      expect(response.headers.get('content-type')).toBe('text/html');
      expect(await response.text()).toContain('original extension');
      expect((await fetch(lease.base + '%2e%2e%2foutside/secret.txt')).status).toBe(404);
      expect((await fetch(lease.base + 'escape/secret.txt')).status).toBe(404);
      expect((await fetch(lease.url, { method: 'POST' })).status).toBe(405);
      lease.revoke(); expect((await fetch(lease.url)).status).toBe(404);
    } finally { files.stop(); await rm(root, { recursive: true, force: true }); }
  });
});
