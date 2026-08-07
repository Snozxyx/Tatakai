'use strict';

/**
 * Persistent device identifier for rate limiting / analytics.
 */
function getOrCreateCID(app, fs, path, crypto, logger) {
    const cidPath = path.join(app.getPath('userData'), '.tatakai-cid');
    try {
        if (fs.existsSync(cidPath)) {
            const existing = fs.readFileSync(cidPath, 'utf-8').trim();
            if (existing && existing.length >= 32) return existing;
        }
    } catch { /* empty */ }
    const cid = `electron-${crypto.randomUUID()}`;
    try {
        fs.writeFileSync(cidPath, cid, 'utf-8');
    } catch (e) {
        logger.error('Failed to write CID:', e);
    }
    return cid;
}

module.exports = { getOrCreateCID };
