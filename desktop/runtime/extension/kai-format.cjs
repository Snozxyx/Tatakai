'use strict';

/**
 * kai-format.cjs
 *
 * Parser and validator for the Tatakai .kai extension format.
 *
 * A .kai file is a ZIP archive with the following structure:
 *
 *   my-extension.kai
 *   ├── manifest.json   (required) extension metadata + Ed25519 signature
 *   ├── bundle.js       (required) sandboxed extension code
 *   ├── README.md       (optional) markdown documentation
 *   └── icon.png        (optional) icon image, base64-encoded on read
 *
 * Manifest schema:
 * {
 *   "id": "tatakai.extension.nyaa-probe",
 *   "name": "Nyaa Probe",
 *   "version": "1.0.0",
 *   "type": "torrent" | "onlinestream" | "custom",
 *   "permissions": ["network:domain:nyaa.si", "torrent:search"],
 *   "author": "Tatakai Labs",
 *   "description": "...",
 *   "signature": "<base64 Ed25519 sig over bundle.js bytes>",
 *   "sideloaded": false   // injected on parse if missing sig
 * }
 */

const JSZip = require('jszip');
const crypto = require('crypto');

const KAI_MAGIC = '.kai';

const REQUIRED_MANIFEST_FIELDS = ['id', 'name', 'version', 'type', 'permissions'];
const VALID_TYPES = ['torrent', 'onlinestream', 'custom'];
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_ICON_BYTES = 512 * 1024;          // 512 KB

// An extension id is used verbatim as a directory name under
// <userData>/extensions/<id>/. If it were allowed to contain path separators or
// `..`, a malicious .kai (or a hand-crafted sideload-manifest call) could make
// installKaiExtension write manifest.json / bundle.js *outside* the extensions
// directory — anywhere the app process can write. Constrain the id to a safe,
// url/path-friendly charset with no separators and no traversal.
const EXTENSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isValidExtensionId(id) {
    return (
        typeof id === 'string' &&
        EXTENSION_ID_RE.test(id) &&
        !id.includes('..') &&
        id !== '.' &&
        id !== '..'
    );
}

const TATAKAI_PUBLIC_KEY_PEM =
    process.env.TATAKAI_EXT_PUBLIC_KEY ||
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n-----END PUBLIC KEY-----';

function verifySignature(bundleBytes, signatureBase64) {
    try {
        const sig = Buffer.from(signatureBase64, 'base64');
        return crypto.verify(null, bundleBytes, {
            key: TATAKAI_PUBLIC_KEY_PEM, format: 'pem', type: 'spki',
        }, sig);
    } catch (_) {
        return false;
    }
}

/**
 * Parse a .kai buffer into a structured KaiExtension object.
 *
 * @param {Buffer} kaiBuffer - Raw .kai file bytes
 * @param {{ skipSignatureCheck?: boolean }} options
 * @returns {Promise<KaiExtension>}
 */
async function parseKaiFile(kaiBuffer, options = {}) {
    let zip;
    try {
        zip = await JSZip.loadAsync(kaiBuffer);
    } catch (err) {
        throw new Error(`Invalid .kai file — not a valid ZIP archive: ${err.message}`);
    }

    // ── manifest.json ──────────────────────────────────────────────────────
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('Invalid .kai — missing manifest.json');

    let manifest;
    try {
        const raw = await manifestFile.async('string');
        manifest = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Invalid .kai — manifest.json parse error: ${err.message}`);
    }

    // ── Validate required fields ────────────────────────────────────────────
    const missing = REQUIRED_MANIFEST_FIELDS.filter(
        (k) => manifest[k] == null || manifest[k] === ''
    );
    if (missing.length > 0) {
        throw new Error(`Invalid .kai manifest — missing fields: ${missing.join(', ')}`);
    }
    if (!isValidExtensionId(manifest.id)) {
        throw new Error(
            'Invalid .kai manifest — id must be a safe identifier ' +
            '(letters, digits, dot, dash, underscore; no path separators or "..")'
        );
    }
    if (!VALID_TYPES.includes(manifest.type)) {
        throw new Error(`Invalid .kai manifest — type must be one of: ${VALID_TYPES.join(' | ')}`);
    }
    if (!Array.isArray(manifest.permissions)) {
        throw new Error('Invalid .kai manifest — permissions must be an array');
    }

    // ── Optional structured fields (validated only if present) ────────────────
    if (manifest.apiServer != null) {
        const s = manifest.apiServer;
        if (typeof s !== 'object' || Array.isArray(s)) {
            throw new Error('Invalid .kai manifest — apiServer must be an object');
        }
        if (typeof s.namespace !== 'string' || s.namespace === '') {
            throw new Error('Invalid .kai manifest — apiServer.namespace must be a non-empty string');
        }
        if (!/^[a-z0-9][a-z0-9-]*$/.test(s.namespace)) {
            throw new Error('Invalid .kai manifest — apiServer.namespace must be url-safe (lowercase, digits, hyphen)');
        }
        if (typeof s.contract !== 'string' || s.contract === '') {
            throw new Error('Invalid .kai manifest — apiServer.contract must be a non-empty string');
        }
        if (!Array.isArray(s.routes)) {
            throw new Error('Invalid .kai manifest — apiServer.routes must be an array');
        }
    }

    const caps = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
    if (caps.includes('custom-source')) {
        const cs = manifest.customSources;
        if (!Array.isArray(cs) || cs.length === 0) {
            throw new Error(
                "Invalid .kai manifest — capabilities includes 'custom-source' " +
                'but customSources[] is empty'
            );
        }
        for (const src of cs) {
            if (!src || typeof src.id !== 'string' || src.id === '') {
                throw new Error('Invalid .kai manifest — each customSources[] entry needs a non-empty id');
            }
            if (src.kind !== 'read' && src.kind !== 'watch') {
                throw new Error(`Invalid .kai manifest — customSources["${src.id}"].kind must be 'read' or 'watch'`);
            }
            if (typeof src.name !== 'string' || src.name === '') {
                throw new Error(`Invalid .kai manifest — customSources["${src.id}"].name must be a non-empty string`);
            }
        }
    }

    // ── bundle.js ───────────────────────────────────────────────────────────
    const bundleFile = zip.file('bundle.js');
    if (!bundleFile) throw new Error('Invalid .kai — missing bundle.js');

    const bundleBytes = await bundleFile.async('nodebuffer');
    if (bundleBytes.length > MAX_BUNDLE_BYTES) {
        throw new Error(`Invalid .kai — bundle.js exceeds ${MAX_BUNDLE_BYTES / 1024 / 1024}MB limit`);
    }
    const bundleCode = bundleBytes.toString('utf8');

    // ── Signature verification ───────────────────────────────────────────────
    const isSideloaded = !manifest.signature;
    let signatureValid = false;

    if (!isSideloaded && !options.skipSignatureCheck) {
        signatureValid = verifySignature(bundleBytes, manifest.signature);
        if (!signatureValid) {
            throw new Error(
                'Invalid .kai — Ed25519 signature verification failed. ' +
                'Only install .kai files from trusted sources.'
            );
        }
    }

    // ── README.md (optional) ─────────────────────────────────────────────────
    const readmeFile = zip.file('README.md');
    const readme = readmeFile ? await readmeFile.async('string') : null;

    // ── icon.png (optional) ──────────────────────────────────────────────────
    let iconBase64 = null;
    const iconFile = zip.file('icon.png') || zip.file('icon.jpg') || zip.file('icon.webp');
    if (iconFile) {
        const iconBytes = await iconFile.async('nodebuffer');
        if (iconBytes.length <= MAX_ICON_BYTES) {
            const ext = iconFile.name.split('.').pop() || 'png';
            iconBase64 = `data:image/${ext};base64,${iconBytes.toString('base64')}`;
        }
    }

    return {
        manifest: { ...manifest, sideloaded: isSideloaded },
        bundleCode,
        readme,
        iconBase64,
        signatureValid: isSideloaded ? null : signatureValid,
        isSideloaded,
        fileSizeBytes: kaiBuffer.length,
    };
}

/**
 * Read a .kai file from disk and parse it.
 * @param {string} filePath
 * @param {object} fs - Node.js fs module
 * @param {object} options
 */
async function readKaiFile(filePath, fs, options = {}) {
    if (!filePath.endsWith(KAI_MAGIC)) {
        throw new Error(`Not a .kai file: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    return parseKaiFile(buffer, options);
}

/**
 * Install a parsed .kai extension to the userData/extensions directory.
 * @param {object} parsed - Result of parseKaiFile
 * @param {string} extensionsDir - Base extensions directory
 * @param {object} fs - Node.js fs module
 * @param {object} path - Node.js path module
 */
function installKaiExtension(parsed, extensionsDir, fs, path) {
    const extId = parsed.manifest.id;
    if (!isValidExtensionId(extId)) {
        throw new Error(`Refusing to install extension with unsafe id: ${extId}`);
    }
    const extDir = path.join(extensionsDir, extId);
    // Defence in depth: even if the id somehow slipped past validation, ensure
    // the resolved target stays inside the extensions directory.
    const resolvedDir = path.resolve(extDir);
    const resolvedBase = path.resolve(extensionsDir);
    if (resolvedDir !== resolvedBase && !resolvedDir.startsWith(resolvedBase + path.sep)) {
        throw new Error('Refusing to install extension outside the extensions directory');
    }
    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });

    fs.writeFileSync(
        path.join(extDir, 'manifest.json'),
        JSON.stringify(parsed.manifest, null, 2),
        'utf8'
    );
    fs.writeFileSync(path.join(extDir, 'bundle.js'), parsed.bundleCode, 'utf8');

    if (parsed.readme) {
        fs.writeFileSync(path.join(extDir, 'README.md'), parsed.readme, 'utf8');
    }
    if (parsed.iconBase64) {
        // Store raw PNG bytes
        const iconMatch = parsed.iconBase64.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (iconMatch) {
            fs.writeFileSync(
                path.join(extDir, 'icon.png'),
                Buffer.from(iconMatch[1], 'base64')
            );
        }
    }

    return { extDir, bundlePath: path.join(extDir, 'bundle.js') };
}

module.exports = {
    parseKaiFile,
    readKaiFile,
    installKaiExtension,
    isValidExtensionId,
    KAI_MAGIC,
    VALID_TYPES,
};
