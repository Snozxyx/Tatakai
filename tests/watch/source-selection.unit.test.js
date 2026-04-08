import assert from 'node:assert/strict';
import { selectSourceForServer } from '../../src/lib/watch/sourceIntelligence.ts';

const sources = [
  { url: 'a', server: 'HD-2', providerName: 'HD-2' },
  { url: 'b', providerName: 'hd-1' },
  { url: 'c', server: 'vidstreaming', providerName: 'VidStreaming' },
];

const s1 = selectSourceForServer(sources, 'hd-2');
assert.equal(s1?.url, 'a', 'should match by server (case-insensitive)');

const s2 = selectSourceForServer(sources, 'HD-1');
assert.equal(s2?.url, 'b', 'should fallback to providerName when server is missing');

const s3 = selectSourceForServer(sources, 'missing');
assert.equal(s3, null, 'should return null for unknown server');

console.log('source-selection.unit.test.js passed');
