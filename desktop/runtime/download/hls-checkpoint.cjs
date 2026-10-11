'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { pipeline } = require('stream/promises');

/** Download complete HLS resources atomically; interrupted resources are retried. */
async function prepareHlsCheckpoint(url, output, headers, signal, onProgress) {
    const response = await axios.get(url, { headers, signal, timeout: 30000, responseType: 'text' });
    url = response.request?.res?.responseUrl || url;
    const text = String(response.data).replace(/^\uFEFF/, "").trimStart();
    if (!text.startsWith('#EXTM3U') || !text.includes('#EXTINF:')) return null;
    if (!text.includes('#EXT-X-ENDLIST')) throw new Error('A live playlist cannot be saved as a completed episode');
    const directory = `${path.resolve(output)}.resume`;
    fs.mkdirSync(directory, { recursive: true });
    const journalFile = path.join(directory, 'checkpoint.json');
    let journal = {};
    try { journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')); } catch (_) {}
    const resources = new Map();
    // Token changes do not invalidate finished chunks; a different host/path,
    // sequence, duration, encryption key or range does invalidate the plan.
    const stableUrl = value => require('./resource-identity.cjs')(value, url);
    const lines = text.split(/\r?\n/);
    const plan = lines.map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${stableUrl(uri)}"`) : line.trim() ? stableUrl(line.trim()) : '').join('\n');
    const fingerprint = crypto.createHash('sha256').update(plan).digest('hex');
    if (journal.fingerprint !== fingerprint) journal = { fingerprint, completed: {} };
    const localize = uri => {
        const remote = new URL(uri, url).toString();
        const name = crypto.createHash('sha256').update(stableUrl(remote)).digest('hex');
        const local = path.join(directory, name);
        resources.set(name, { remote, local });
        return local.replace(/\\/g, '/');
    };
    const localLines = lines.map(line => line.startsWith('#') ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${localize(uri)}"`) : line.trim() ? localize(line.trim()) : line);
    const work = [...resources.entries()];
    let cursor = 0, done = work.filter(([name, item]) => journal.completed[name] && fs.existsSync(item.local) && fs.statSync(item.local).size === journal.completed[name]).length;
    onProgress?.({ percent: Math.round(done / work.length * 95), phase: 'segments' });
    await Promise.all(Array.from({ length: Math.min(3, work.length) }, async () => {
        while (cursor < work.length) {
            const [name, item] = work[cursor++];
            signal?.throwIfAborted();
            const valid = journal.completed[name] && fs.existsSync(item.local) && fs.statSync(item.local).size === journal.completed[name];
            if (!valid) {
                const media = await axios.get(item.remote, { headers, signal, timeout: 45000, responseType: 'stream' });
                const partial = `${item.local}.part`;
                await pipeline(media.data, fs.createWriteStream(partial), { signal });
                const size = fs.statSync(partial).size;
                if (!size) throw new Error('Empty HLS resource');
                require('./atomic-file.cjs').renameAtomic(partial, item.local);
                journal.completed[name] = size;
                require('./atomic-file.cjs').writeAtomic(journalFile, JSON.stringify(journal));
                done++;
            }
            onProgress?.({ percent: Math.round(done / work.length * 95), phase: 'segments' });
        }
    }));
    const playlist = path.join(directory, 'playlist.m3u8');
    fs.writeFileSync(playlist, localLines.join('\n'));
    return playlist;
}
module.exports = { prepareHlsCheckpoint };
