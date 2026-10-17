import { expect, test } from 'bun:test';
import { xmltvTime, parseXMLTVChunk, nowNext } from '../src/core/iptv/epgParser';
test('XMLTV converts explicit offsets independently of device timezone', () => {
  expect(xmltvTime('20261016120000 +0530')).toBe(Date.UTC(2026, 9, 16, 6, 30));
  expect(xmltvTime('20261016080000 -0400')).toBe(Date.UTC(2026, 9, 16, 12));
  expect(xmltvTime('20261016120000 Z')).toBe(Date.UTC(2026, 9, 16, 12));
});
test('parses entities, maps channels, ignores invalid ranges and finds Now/Next', () => {
  const xml = '<tv><programme start="20261016120000 +0000" stop="20261016130000 +0000" channel="anime"><title>A &amp; B</title></programme><programme start="20261016130000 +0000" stop="20261016140000 +0000" channel="anime"><title>Next</title></programme><programme start="bad" stop="bad" channel="anime"><title>Bad</title></programme></tv>';
  const rows = parseXMLTVChunk(xml, 'playlist'); expect(rows).toHaveLength(2); expect(rows[0].title).toBe('A & B'); expect(rows[0].channelId).toBe('anime');
  const current = nowNext(rows, Date.UTC(2026, 9, 16, 12, 30)); expect(current.now?.title).toBe('A & B'); expect(current.next?.title).toBe('Next');
  expect(nowNext(rows, Date.UTC(2026, 9, 16, 13)).now?.title).toBe('Next');
});
test('rejects DTDs and entity declarations', () => expect(() => parseXMLTVChunk('<!DOCTYPE tv SYSTEM "file:///secret">', 'p')).toThrow());
test('processes many bounded fragments consistently', () => {
  const fragment = '<programme start="20261016120000 +0000" stop="20261016130000 +0000" channel="x"><title>Program</title></programme>';
  expect(parseXMLTVChunk(fragment.repeat(2000), 'p')).toHaveLength(2000);
});
