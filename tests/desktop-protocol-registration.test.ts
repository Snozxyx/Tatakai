import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { registerProtocolClient } = require('../desktop/window/deep-link.cjs');
const entry = path.resolve(import.meta.dir, '../desktop/main.cjs');

function register(isPackaged: boolean) {
    const calls: unknown[][] = [];
    registerProtocolClient({
        isPackaged,
        setAsDefaultProtocolClient(...args: unknown[]) { calls.push(args); },
    }, path);
    return calls;
}

describe('desktop protocol registration', () => {
    it('includes the app entry for unpackaged Electron even without defaultApp', () => {
        expect(register(false)).toEqual([
            ['tatakai', process.execPath, [entry]],
            ['magnet', process.execPath, [entry]],
        ]);
    });

    it('does not mistake a callback argument for the app entry', () => {
        const argv = process.argv;
        try {
            process.argv = [process.execPath, 'tatakai://integration/mal/redirect?code=test'];
            expect(register(false)[0]).toEqual(['tatakai', process.execPath, [entry]]);
            process.argv = [process.execPath];
            expect(register(false)[0]).toEqual(['tatakai', process.execPath, [entry]]);
        } finally {
            process.argv = argv;
        }
    });

    it('registers a packaged executable without a source entry argument', () => {
        expect(register(true)).toEqual([['tatakai'], ['magnet']]);
    });
});
