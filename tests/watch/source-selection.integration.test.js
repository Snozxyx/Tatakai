import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { selectSourceForServer } from '../../src/lib/watch/sourceIntelligence.ts';

const fixturePath = path.resolve(process.cwd(), 'tests/watch/fixtures/mixed-sources.fixture.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const hd2 = selectSourceForServer(fixture.sources, 'hd-2');
assert.equal(hd2?.url, 'https://example.com/manifest-a.m3u8');

const hd1 = selectSourceForServer(fixture.sources, 'HD-1');
assert.equal(hd1?.url, 'https://example.com/manifest-b.m3u8');

const animeya = selectSourceForServer(fixture.sources, 'animeya');
assert.equal(animeya?.url, 'https://example.com/video-c.mp4');

console.log('source-selection.integration.test.js passed');
