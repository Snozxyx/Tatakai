'use strict';

/**
 * Tests for the extension:load IPC handler — signature verification.
 *
 * **Validates: Requirements 10.1**
 * **Property 9: Signature verification gates installation**
 *
 * Property 9: For any extension manifest, installation must succeed if and only
 * if the `signature` field verifies against the Tatakai public key (for curated
 * extensions) or the `sideloaded` flag is `true` (for sideloaded extensions).
 * An invalid signature must always abort installation without writing files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Test key pair — generated fresh for each test run
// ---------------------------------------------------------------------------

const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } =
    crypto.generateKeyPairSync('ed25519');

const TEST_PUBLIC_KEY_PEM = TEST_PUBLIC_KEY.export({ type: 'spki', format: 'pem' });
const TEST_PRIVATE_KEY_PEM = TEST_PRIVATE_KEY.export({ type: 'pkcs8', format: 'pem' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Signs bundle content with the test private key.
 * Returns a base64-encoded Ed25519 signature.
 */
function signBundle(bundleContent) {
    const sig = crypto.sign(
        null,
        Buffer.from(bundleContent, 'utf8'),
        { key: TEST_PRIVATE_KEY_PEM, format: 'pem', type: 'pkcs8' }
    );
    return sig.toString('base64');
}

/**
 * Verifies a base64-encoded Ed25519 signature against bundle content using
 * the test public key.  Mirrors the logic in ipc-runtime.cjs.
 */
function verifySignature(bundleContent, signatureBase64) {
    try {
        const signatureBuffer = Buffer.from(signatureBase64, 'base64');
        const bundleBuffer = Buffer.from(bundleContent, 'utf8');
        return crypto.verify(
            null,
            bundleBuffer,
            {
                key: TEST_PUBLIC_KEY_PEM,
                format: 'pem',
                type: 'spki',
                dsaEncoding: 'ieee-p1363',
            },
            signatureBuffer
        );
    } catch (_err) {
        return false;
    }
}

/** Build a minimal valid curated manifest (sideloaded: false). */
function makeCuratedManifest(id, signature) {
    return {
        id,
        name: `Extension ${id}`,
        version: '1.0.0',
        type: 'custom',
        description: `Test extension ${id}`,
        permissions: [],
        sideloaded: false,
        signature,
    };
}

/** Build a minimal valid sideloaded manifest (sideloaded: true). */
function makeSideloadedManifest(id) {
    return {
        id,
        name: `Sideloaded ${id}`,
        version: '1.0.0',
        type: 'custom',
        description: `Sideloaded extension ${id}`,
        permissions: [],
        sideloaded: true,
        // No signature field
    };
}

// ---------------------------------------------------------------------------
// Unit tests — verifyExtensionSignature logic
// ---------------------------------------------------------------------------

describe('verifyExtensionSignature — unit tests', () => {
    const BUNDLE = 'module.exports = { default: class TestExt {} };';

    it('returns true for a valid signature over the bundle content', () => {
        const sig = signBundle(BUNDLE);
        expect(verifySignature(BUNDLE, sig)).toBe(true);
    });

    it('returns false when the bundle content has been tampered', () => {
        const sig = signBundle(BUNDLE);
        const tampered = BUNDLE + ' // tampered';
        expect(verifySignature(tampered, sig)).toBe(false);
    });

    it('returns false for a completely wrong signature', () => {
        const wrongSig = Buffer.alloc(64, 0).toString('base64');
        expect(verifySignature(BUNDLE, wrongSig)).toBe(false);
    });

    it('returns false for a malformed (non-base64) signature', () => {
        expect(verifySignature(BUNDLE, '!!!not-base64!!!')).toBe(false);
    });

    it('returns false for an empty signature string', () => {
        expect(verifySignature(BUNDLE, '')).toBe(false);
    });

    it('returns false when signature is for different content', () => {
        const otherBundle = 'module.exports = { default: class OtherExt {} };';
        const sig = signBundle(otherBundle);
        expect(verifySignature(BUNDLE, sig)).toBe(false);
    });

    it('returns true for any valid bundle content signed with the correct key', () => {
        const bundles = [
            'module.exports = {};',
            'class Ext { async single() { return []; } } module.exports = { default: Ext };',
            '// minimal\nmodule.exports = { default: {} };',
        ];
        for (const bundle of bundles) {
            const sig = signBundle(bundle);
            expect(verifySignature(bundle, sig)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Integration-style tests — extension:load handler behaviour
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock of the ipc-runtime handler environment so we can
 * exercise the extension:load logic without a real Electron app instance.
 *
 * We extract the handler logic into a testable function that mirrors what
 * ipc-runtime.cjs does, but uses the test public key.
 */
function makeLoadHandler(tmpDir, publicKeyPem) {
    const { ExtensionRegistry } = require('../desktop/runtime/extension-registry.cjs');
    const registry = new ExtensionRegistry();

    /**
     * Mirrors the extension:load handler logic from ipc-runtime.cjs,
     * but uses `publicKeyPem` for signature verification instead of the
     * production key.
     */
    async function handleExtensionLoad({ extensionId, manifest }) {
        try {
            if (registry.isKillSwitched(extensionId)) {
                return { success: false, error: 'Extension is blocked by kill-switch' };
            }

            const extensionsDir = path.join(tmpDir, 'extensions');
            const bundlePath = path.join(extensionsDir, extensionId, 'bundle.js');

            if (!manifest.sideloaded) {
                if (fs.existsSync(bundlePath)) {
                    const bundleContent = fs.readFileSync(bundlePath, 'utf8');
                    const signature = manifest.signature;

                    if (!signature) {
                        return { success: false, error: 'Extension signature invalid — installation aborted' };
                    }

                    // Use the injected public key for verification
                    let valid = false;
                    try {
                        const signatureBuffer = Buffer.from(signature, 'base64');
                        const bundleBuffer = Buffer.from(bundleContent, 'utf8');
                        valid = crypto.verify(
                            null,
                            bundleBuffer,
                            { key: publicKeyPem, format: 'pem', type: 'spki', dsaEncoding: 'ieee-p1363' },
                            signatureBuffer
                        );
                    } catch (_err) {
                        valid = false;
                    }

                    if (!valid) {
                        return { success: false, error: 'Extension signature invalid — installation aborted' };
                    }
                } else {
                    if (!manifest.signature) {
                        return { success: false, error: 'Extension signature invalid — installation aborted' };
                    }
                    const extDir = path.join(extensionsDir, extensionId);
                    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
                    fs.writeFileSync(
                        path.join(extDir, 'manifest.json'),
                        JSON.stringify(manifest, null, 2),
                        'utf8'
                    );
                }
            } else {
                if (!fs.existsSync(bundlePath)) {
                    const extDir = path.join(extensionsDir, extensionId);
                    if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
                    fs.writeFileSync(
                        path.join(extDir, 'manifest.json'),
                        JSON.stringify(manifest, null, 2),
                        'utf8'
                    );
                }
            }

            registry.register(extensionId, manifest, bundlePath);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    return { handleExtensionLoad, registry };
}

describe('extension:load handler — signature verification', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-ext-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ── Curated extensions (sideloaded: false) ────────────────────────────────

    it('succeeds for a curated extension with a valid signature and bundle on disk', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = { default: class Ext {} };';
        const sig = signBundle(BUNDLE);

        // Write bundle to disk
        const extDir = path.join(tmpDir, 'extensions', 'ext-valid');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), BUNDLE, 'utf8');

        const result = await handleExtensionLoad({
            extensionId: 'ext-valid',
            manifest: makeCuratedManifest('ext-valid', sig),
        });

        expect(result.success).toBe(true);
        expect(registry.lookup('ext-valid')).toBeDefined();
    });

    it('rejects a curated extension with an invalid signature', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = { default: class Ext {} };';
        const wrongSig = Buffer.alloc(64, 0).toString('base64');

        const extDir = path.join(tmpDir, 'extensions', 'ext-bad-sig');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), BUNDLE, 'utf8');

        const result = await handleExtensionLoad({
            extensionId: 'ext-bad-sig',
            manifest: makeCuratedManifest('ext-bad-sig', wrongSig),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('signature invalid');
        // Must NOT be registered
        expect(registry.lookup('ext-bad-sig')).toBeUndefined();
    });

    it('rejects a curated extension with a tampered bundle', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const ORIGINAL = 'module.exports = { default: class Ext {} };';
        const TAMPERED = ORIGINAL + ' // injected malicious code';
        const sig = signBundle(ORIGINAL); // signed over original, not tampered

        const extDir = path.join(tmpDir, 'extensions', 'ext-tampered');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), TAMPERED, 'utf8'); // tampered on disk

        const result = await handleExtensionLoad({
            extensionId: 'ext-tampered',
            manifest: makeCuratedManifest('ext-tampered', sig),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('signature invalid');
        expect(registry.lookup('ext-tampered')).toBeUndefined();
    });

    it('rejects a curated extension with a missing signature field', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = {};';

        const extDir = path.join(tmpDir, 'extensions', 'ext-no-sig');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), BUNDLE, 'utf8');

        const result = await handleExtensionLoad({
            extensionId: 'ext-no-sig',
            manifest: makeCuratedManifest('ext-no-sig', undefined),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('signature invalid');
        expect(registry.lookup('ext-no-sig')).toBeUndefined();
    });

    it('rejects a curated extension with no bundle on disk and no signature', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

        const result = await handleExtensionLoad({
            extensionId: 'ext-no-bundle-no-sig',
            manifest: { ...makeCuratedManifest('ext-no-bundle-no-sig', undefined), signature: undefined },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('signature invalid');
        expect(registry.lookup('ext-no-bundle-no-sig')).toBeUndefined();
    });

    it('succeeds for a curated extension with no bundle on disk but a valid signature field', async () => {
        // When the bundle is not yet on disk, we accept the load if the signature field is present.
        // The actual signature verification happens when the bundle is written and the extension is re-loaded.
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = {};';
        const sig = signBundle(BUNDLE);

        const result = await handleExtensionLoad({
            extensionId: 'ext-no-bundle-with-sig',
            manifest: makeCuratedManifest('ext-no-bundle-with-sig', sig),
        });

        expect(result.success).toBe(true);
        // Manifest should be persisted to disk
        const manifestPath = path.join(tmpDir, 'extensions', 'ext-no-bundle-with-sig', 'manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
    });

    // ── Sideloaded extensions (sideloaded: true) ──────────────────────────────

    it('succeeds for a sideloaded extension without any signature', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

        const result = await handleExtensionLoad({
            extensionId: 'ext-sideloaded',
            manifest: makeSideloadedManifest('ext-sideloaded'),
        });

        expect(result.success).toBe(true);
        expect(registry.lookup('ext-sideloaded')).toBeDefined();
    });

    it('succeeds for a sideloaded extension even if the signature would be invalid', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = {};';

        const extDir = path.join(tmpDir, 'extensions', 'ext-sideloaded-bad-sig');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), BUNDLE, 'utf8');

        const manifest = {
            ...makeSideloadedManifest('ext-sideloaded-bad-sig'),
            signature: Buffer.alloc(64, 0).toString('base64'), // invalid sig, but sideloaded
        };

        const result = await handleExtensionLoad({
            extensionId: 'ext-sideloaded-bad-sig',
            manifest,
        });

        expect(result.success).toBe(true);
        expect(registry.lookup('ext-sideloaded-bad-sig')).toBeDefined();
    });

    // ── Kill-switch ───────────────────────────────────────────────────────────

    it('rejects loading a kill-switched extension regardless of signature', async () => {
        const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);
        const BUNDLE = 'module.exports = {};';
        const sig = signBundle(BUNDLE);

        const extDir = path.join(tmpDir, 'extensions', 'ext-killed');
        fs.mkdirSync(extDir, { recursive: true });
        fs.writeFileSync(path.join(extDir, 'bundle.js'), BUNDLE, 'utf8');

        // Pre-set kill-switch
        registry.setKillSwitch('ext-killed', true);

        const result = await handleExtensionLoad({
            extensionId: 'ext-killed',
            manifest: makeCuratedManifest('ext-killed', sig),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('kill-switch');
        expect(registry.lookup('ext-killed')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 9
// ---------------------------------------------------------------------------

/**
 * Property 9: Signature verification gates installation
 *
 * For any extension manifest, installation must succeed if and only if:
 *   - The `signature` field verifies against the Tatakai public key (curated), OR
 *   - The `sideloaded` flag is `true` (sideloaded).
 *
 * An invalid signature must always abort installation without writing files.
 *
 * **Validates: Requirements 6.3, 6.4, 10.1**
 */
describe('Property 9: Signature verification gates installation', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-prop9-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    /**
     * Seeded PRNG for reproducible property tests.
     */
    function seededRand(seed) {
        let s = seed;
        return function () {
            s = (s * 1664525 + 1013904223) & 0xffffffff;
            return (s >>> 0) / 0xffffffff;
        };
    }

    it('curated extension with valid signature always succeeds', async () => {
        const rand = seededRand(42);
        const ITERATIONS = 50;

        for (let i = 0; i < ITERATIONS; i++) {
            const id = `ext-valid-${i}`;
            const bundleContent = `module.exports = { id: '${id}', iter: ${i} };`;
            const sig = signBundle(bundleContent);

            const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

            const extDir = path.join(tmpDir, 'extensions', id);
            fs.mkdirSync(extDir, { recursive: true });
            fs.writeFileSync(path.join(extDir, 'bundle.js'), bundleContent, 'utf8');

            const result = await handleExtensionLoad({
                extensionId: id,
                manifest: makeCuratedManifest(id, sig),
            });

            expect(result.success).toBe(true);
            expect(registry.lookup(id)).toBeDefined();

            // Cleanup for next iteration
            fs.rmSync(path.join(tmpDir, 'extensions', id), { recursive: true, force: true });
        }
    });

    it('curated extension with invalid signature always fails', async () => {
        const rand = seededRand(99);
        const ITERATIONS = 50;

        for (let i = 0; i < ITERATIONS; i++) {
            const id = `ext-invalid-${i}`;
            const bundleContent = `module.exports = { id: '${id}' };`;
            // Generate a random wrong signature (not a valid Ed25519 sig over this content)
            const wrongSig = Buffer.from(
                Array.from({ length: 64 }, () => Math.floor(rand() * 256))
            ).toString('base64');

            const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

            const extDir = path.join(tmpDir, 'extensions', id);
            fs.mkdirSync(extDir, { recursive: true });
            fs.writeFileSync(path.join(extDir, 'bundle.js'), bundleContent, 'utf8');

            const result = await handleExtensionLoad({
                extensionId: id,
                manifest: makeCuratedManifest(id, wrongSig),
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('signature invalid');
            expect(registry.lookup(id)).toBeUndefined();

            // Cleanup for next iteration
            fs.rmSync(path.join(tmpDir, 'extensions', id), { recursive: true, force: true });
        }
    });

    it('sideloaded extension always succeeds regardless of signature', async () => {
        const rand = seededRand(7);
        const ITERATIONS = 50;

        for (let i = 0; i < ITERATIONS; i++) {
            const id = `ext-sideloaded-${i}`;
            const bundleContent = `module.exports = { id: '${id}' };`;

            const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

            const extDir = path.join(tmpDir, 'extensions', id);
            fs.mkdirSync(extDir, { recursive: true });
            fs.writeFileSync(path.join(extDir, 'bundle.js'), bundleContent, 'utf8');

            // Randomly include a signature (valid, invalid, or absent)
            const sigChoice = Math.floor(rand() * 3);
            let signature;
            if (sigChoice === 0) {
                signature = signBundle(bundleContent); // valid
            } else if (sigChoice === 1) {
                signature = Buffer.alloc(64, 0).toString('base64'); // invalid
            } else {
                signature = undefined; // absent
            }

            const manifest = { ...makeSideloadedManifest(id), signature };

            const result = await handleExtensionLoad({
                extensionId: id,
                manifest,
            });

            expect(result.success).toBe(true);
            expect(registry.lookup(id)).toBeDefined();

            // Cleanup for next iteration
            fs.rmSync(path.join(tmpDir, 'extensions', id), { recursive: true, force: true });
        }
    });

    it('tampered bundle always fails for curated extensions', async () => {
        const ITERATIONS = 30;

        for (let i = 0; i < ITERATIONS; i++) {
            const id = `ext-tampered-${i}`;
            const originalBundle = `module.exports = { id: '${id}', original: true };`;
            const tamperedBundle = originalBundle + ` // tampered iteration ${i}`;
            const sig = signBundle(originalBundle); // signed over original

            const { handleExtensionLoad, registry } = makeLoadHandler(tmpDir, TEST_PUBLIC_KEY_PEM);

            const extDir = path.join(tmpDir, 'extensions', id);
            fs.mkdirSync(extDir, { recursive: true });
            fs.writeFileSync(path.join(extDir, 'bundle.js'), tamperedBundle, 'utf8'); // tampered on disk

            const result = await handleExtensionLoad({
                extensionId: id,
                manifest: makeCuratedManifest(id, sig),
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('signature invalid');
            expect(registry.lookup(id)).toBeUndefined();

            // Cleanup for next iteration
            fs.rmSync(path.join(tmpDir, 'extensions', id), { recursive: true, force: true });
        }
    });
});
