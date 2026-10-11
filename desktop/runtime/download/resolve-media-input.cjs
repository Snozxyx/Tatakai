'use strict';
const axios = require('axios');

// Inspect a bounded prefix, even for extensionless proxy URLs. Never buffer a
// whole video just to identify its format.
async function resolveMediaInput(url, headers = {}, signal) {
    if (!/^https?:/i.test(url)) return { url, isHls: /\.m3u8(?:$|[?#])/i.test(url) };
    const response = await axios.get(url, { headers, signal, timeout: 15000, responseType: 'stream', maxRedirects: 5 });
    const finalUrl = response.request?.res?.responseUrl || url;
    const chunks = [];
    let length = 0;
    let isHls = false;
    try {
        for await (const chunk of response.data) {
            chunks.push(chunk); length += chunk.length;
            const prefix = Buffer.concat(chunks).toString('utf8');
            if (length >= 7) {
                isHls = prefix.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U');
                if (!isHls) return { url: finalUrl, isHls: false };
            }
            if (length > 2 * 1024 * 1024) throw new Error('HLS playlist is too large');
        }
    } finally { response.data.destroy(); }
    if (!isHls) return { url: finalUrl, isHls: false };
    const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
    let best = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
        const bandwidth = Number((line.match(/[,:]BANDWIDTH=(\d+)/) || [])[1] || 0);
        const height = Number((line.match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0);
        const uri = lines.slice(i + 1).find(value => value.trim() && !value.trim().startsWith('#'))?.trim();
        if (uri && (!best || bandwidth > best.bandwidth || (bandwidth === best.bandwidth && height > best.height))) best = { bandwidth, height, uri };
    }
    return { url: best ? new URL(best.uri, finalUrl).href : finalUrl, isHls: true };
}
module.exports = { resolveMediaInput };
