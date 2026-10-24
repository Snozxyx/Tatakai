import { describe, it, expect } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHomeServerStore } = require('../desktop/runtime/home-server/store.cjs');

function fixture(config, { readOnly = false } = {}) {
  let saved = JSON.stringify(config);
  const store = createHomeServerStore({
    app: { getPath: () => import.meta.dir },
    fs: {
      existsSync: () => true,
      readFileSync: () => saved,
      writeFileSync: (_path, value) => {
        if (readOnly) throw new Error('read-only fixture');
        saved = value;
      },
    },
    logger: { warn() {} },
  });
  return { store, persisted: () => JSON.parse(saved) };
}

describe('home-server persisted origin upgrade', () => {
  it('removes the old wildcard default on disk and preserves credentials and other configuration', () => {
    const previous = { corsOrigins: ['*'], port: 1234, passwordHash: 'fixture-hash', tokens: { fixture: { userId: 'admin' } } };
    const { store, persisted } = fixture(previous);
    const config = store.read();
    expect(config.corsOrigins).toEqual([]);
    expect(persisted().corsOrigins).toEqual([]);
    expect(config.passwordHash).toBe(previous.passwordHash);
    expect(config.tokens).toEqual(previous.tokens);
    expect(config.port).toBe(1234);
    expect(store.read()).toEqual(config);
  });

  it('retains explicit origins when upgrading a mixed allowlist', () => {
    const { store, persisted } = fixture({ corsOrigins: ['*', ' https://household.example ', 'https://household.example', null] });
    expect(store.read().corsOrigins).toEqual(['https://household.example']);
    expect(persisted().corsOrigins).toEqual(['https://household.example']);
  });

  it('returns safe origins even when persisting the upgrade fails', () => {
    const { store, persisted } = fixture({ corsOrigins: ['*'] }, { readOnly: true });
    expect(store.read().corsOrigins).toEqual([]);
    expect(store.read().corsOrigins).toEqual([]);
    expect(persisted().corsOrigins).toEqual(['*']);
  });

  it('does not restore wildcard access through settings writes', () => {
    const { store, persisted } = fixture({ corsOrigins: [] });
    expect(store.write({ ...store.read(), corsOrigins: ['*', 'https://household.example'] })).toBe(true);
    expect(persisted().corsOrigins).toEqual(['https://household.example']);
    expect(store.read().corsOrigins).toEqual(['https://household.example']);
  });
});
