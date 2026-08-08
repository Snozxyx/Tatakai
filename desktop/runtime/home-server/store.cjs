'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function defaultConfig() {
  return {
    enabled: false,
    port: 8787,
    bindMode: 'lan', // 'localhost' | 'lan' | 'all'
    passwordHash: null,
    passwordSalt: null,
    remoteEnabled: false,
    remoteBaseUrl: '',
    catalogApiBase: process.env.VITE_TATAKAI_API_URL || 'https://api.tatakai.app/api/v3',
    shareCatalog: true,
    requireConsent: true,
    consentRequests: [],
    users: [
      {
        id: 'admin',
        name: 'Admin',
        role: 'admin',
        passwordHash: null,
        passwordSalt: null,
        permissions: ['library', 'downloads', 'streams', 'extensions', 'users', 'catalog'],
      },
    ],
    tokens: {},
    corsOrigins: ['*'],
    rateLimitPerMinute: 120,
  };
}

function createHomeServerStore({ app, fs: fsMod, path: pathMod, logger }) {
  const fsApi = fsMod || fs;
  const pathApi = pathMod || path;
  const configPath = pathApi.join(app.getPath('userData'), 'home-server.json');

  function read() {
    try {
      if (!fsApi.existsSync(configPath)) return defaultConfig();
      const raw = JSON.parse(fsApi.readFileSync(configPath, 'utf8'));
      return { ...defaultConfig(), ...raw, users: raw.users || defaultConfig().users };
    } catch (err) {
      logger?.warn?.('home-server store read failed', err);
      return defaultConfig();
    }
  }

  function write(config) {
    try {
      fsApi.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (err) {
      logger?.warn?.('home-server store write failed', err);
      return false;
    }
  }

  function hashPassword(password, salt) {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), useSalt, 64).toString('hex');
    return { hash, salt: useSalt };
  }

  function verifyPassword(password, hash, salt) {
    if (!hash || !salt) return false;
    const next = crypto.scryptSync(String(password), salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
    } catch {
      return false;
    }
  }

  function issueToken(userId, label = 'device') {
    const config = read();
    const token = crypto.randomBytes(24).toString('hex');
    config.tokens[token] = {
      userId,
      label,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    write(config);
    return token;
  }

  function revokeToken(token) {
    const config = read();
    delete config.tokens[token];
    write(config);
  }

  function resolveToken(token) {
    const config = read();
    const row = config.tokens[token];
    if (!row) return null;
    row.lastUsedAt = Date.now();
    write(config);
    const user = (config.users || []).find((u) => u.id === row.userId) || null;
    return { token: row, user };
  }

  return {
    configPath,
    read,
    write,
    hashPassword,
    verifyPassword,
    issueToken,
    revokeToken,
    resolveToken,
    defaultConfig,
  };
}

module.exports = { createHomeServerStore, defaultConfig };
