'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { pipeline } = require('stream/promises');

async function prepareFileCheckpoint(url, output, headers, signal, onProgress) {
    const directory = `${path.resolve(output)}.resume`;
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'media.partial');
    const metadataFile = path.join(directory, 'file.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(metadataFile, 'utf8')); } catch (_) {}
    let head;
    try { head = await axios.head(url, { headers, signal, timeout: 15000 }); } catch (_) { signal?.throwIfAborted(); }
    const validator = head?.headers?.etag || head?.headers?.['last-modified'];
    const length = Number(head?.headers?.['content-length']) || 0;
    const stable = require('./resource-identity.cjs')(url);
    const canResume = validator && saved.validator === validator && saved.url === stable;
    let offset = canResume && fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (length && offset === length) { onProgress?.({ percent: 95 }); return file; }
    if (length && offset > length) offset = 0;
    let response = await axios.get(url, { headers: { ...headers, ...(offset ? { Range: `bytes=${offset}-`, 'If-Range': validator } : {}) }, signal, timeout: 45000, responseType: 'stream' });
    if (offset && (response.status !== 206 || !String(response.headers['content-range'] || '').startsWith(`bytes ${offset}-`))) {
        response.data.destroy();
        offset = 0;
        response = await axios.get(url, { headers, signal, timeout: 45000, responseType: 'stream' });
    }
    fs.writeFileSync(metadataFile, JSON.stringify({ url: stable, validator: validator || response.headers.etag || response.headers['last-modified'] }));
    const total = length || offset + Number(response.headers['content-length']);
    let received = offset;
    onProgress?.({ percent: total ? Math.round(received / total * 95) : 0 });
    response.data.on('data', chunk => { received += chunk.length; onProgress?.({ percent: total ? Math.min(95, Math.round(received / total * 95)) : 0 }); });
    await pipeline(response.data, fs.createWriteStream(file, { flags: offset ? 'a' : 'w' }), { signal });
    if (total && fs.statSync(file).size !== total) throw new Error('Download interrupted before the complete file was received');
    return file;
}
module.exports = { prepareFileCheckpoint };
