import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectCanonicalRelease} from '../scripts/finalize-native-release.mjs';
test('keeps complete draft and identifies only empty duplicates',()=>{const full={id:1,draft:true,assets:[{name:'app',size:42}]},empty={id:2,draft:false,assets:[]};assert.deepEqual(selectCanonicalRelease([empty,full],['app']),{canonical:full,duplicates:[empty]});});
test('idempotently selects an already published complete release',()=>{const full={id:1,draft:false,assets:[{name:'app',size:42}]};assert.deepEqual(selectCanonicalRelease([full],['app']).duplicates,[]);});
test('refuses incomplete builds or a second nonempty release',()=>{assert.throws(()=>selectCanonicalRelease([{id:1,assets:[]}],['app']));assert.throws(()=>selectCanonicalRelease([{id:1,assets:[{name:'app',size:42}]},{id:2,assets:[{name:'other',size:4}]}],['app']));});
