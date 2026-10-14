import { describe, it, expect } from 'bun:test';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
const { parseKaiFile } = createRequire(import.meta.url)('../desktop/runtime/extension/kai-format.cjs');
const pack = async (patch = {}, bundle = 'module.exports = {};') => {
  const zip = new JSZip(); zip.file('manifest.json', JSON.stringify({ id: 'unsigned-source', name: 'Source', version: '1.0.0', type: 'onlinestream', permissions: [], ...patch }));
  if (bundle !== null) zip.file('bundle.js', bundle);
  return zip.generateAsync({ type: 'nodebuffer' });
};
describe('unsigned package installation', () => {
  it('accepts unsigned native packages', async () => { expect((await parseKaiFile(await pack())).manifest.id).toBe('unsigned-source'); });
  it('ignores legacy signing fields', async () => { const parsed = await parseKaiFile(await pack({ signature: 'bad', signedBy: 'legacy', sideloaded: false })); expect(parsed.manifest.signature).toBeUndefined(); expect(parsed.manifest.sideloaded).toBeUndefined(); });
  it('retains safe identifier validation', async () => { await expect(parseKaiFile(await pack({ id: '../outside' }))).rejects.toThrow('safe identifier'); });
  it('rejects missing bundles', async () => { await expect(parseKaiFile(await pack({}, null))).rejects.toThrow('bundle'); });
});
