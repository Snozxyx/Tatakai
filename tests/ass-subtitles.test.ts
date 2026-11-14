import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { prepareSubtitle, uploadSubtitle } from '../src/core/player/subtitle-service';
import { isAssScript } from '../src/core/player/subtitle-utils';

const ass=readFileSync(new URL('./fixtures/ass-features.ass',import.meta.url),'utf8');
describe('full ASS subtitle documents',()=>{
  it('keeps the complete script, styles, drawings and animation tags for libass',()=>{
    const prepared=prepareSubtitle(ass,'effects.ass','en');
    expect(prepared.assContent).toBe(ass);
    expect(prepared.originalFormat).toBe('ass');
    expect(prepared.vtt).toContain('Karaoke');
    for(const tag of ['\\kf','\\move','\\t(','\\p1','\\clip','\\iclip','\\fad','\\frx','\\fry','\\fax']) expect(prepared.assContent).toContain(tag);
  });
  it('preserves the original ASS content when a subtitle file is uploaded',async()=>{
    const prepared=await uploadSubtitle(new File([ass],'fansub.ass'));
    expect(prepared.assContent).toBe(ass);prepared.dispose();
  });
  it('detects SSA and drawing-only scripts without depending on the filename',()=>{
    const drawing='[Script Info]\n[V4 Styles]\n[Events]\nDialogue: Marked=0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100';
    expect(isAssScript(drawing)).toBe(true);expect(prepareSubtitle(drawing).assContent).toBe(drawing);
  });
  it('retains normal VTT and SRT handling',()=>{
    expect(prepareSubtitle('1\n00:00:01,000 --> 00:00:03,000\nHello').assContent).toBeUndefined();
    expect(prepareSubtitle('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello').vtt).toContain('Hello');
  });
});
