import { describe, expect, it } from 'bun:test';
import { getQuickJS } from 'quickjs-emscripten';
import { evaluateMangayomi } from '../src/core/extensions/mangayomi/vm';
import { createMangayomiDom } from '../src/core/extensions/mangayomi/dom';
import { isMangayomiRepositoryMetadata } from '../src/core/extensions/mangayomi/repository';
import { mangayomiEntryNumber } from '../src/core/extensions/mangayomi/chapter-number';

describe('original Mangayomi JavaScript host boundary', () => {
  it('runs provider, HTTP, CSS selectors and preference defaults without app capabilities', async () => {
    const engine = await getQuickJS(), requests: any[] = [];
    const code = `class DefaultExtension extends MProvider {
      getSourcePreferences(){return [{key:'cookie',editTextPreference:{value:'default-cookie'}}];}
      getHeaders(){return {Cookie:new SharedPreferences().get('cookie')};}
      async search(query){
        if(typeof window!=='undefined'||typeof indexedDB!=='undefined'||typeof require!=='undefined')throw Error('Realm leaked');
        const response=await new Client().get(this.source.apiUrl+'/search?q='+encodeURIComponent(query),this.getHeaders());
        if(response.statusCode!==200)throw Error('HTTP response contract changed');
        return new Document(response.body).select('article a').map(el=>({title:el.text,id:el.attr('href'),image:el.selectFirst('img').getSrc}));
      }
    }`;
    const result = await evaluateMangayomi(engine, code, 'search', ["rain'); throw Error('injected'); //"], { source: { apiUrl: 'https://source.test' }, preferences: {} }, async request => {
      requests.push(request); return { status: 200, headers: {}, body: '<article><a href="opaque-雨">Title 雨<img src="/image.jpg"></a></article><script>globalThis.compromised=true</script>' };
    }, createMangayomiDom());
    expect(result.value).toEqual([{ title: 'Title 雨', id: 'opaque-雨', image: '/image.jpg' }]);
    expect(requests[0].headers.Cookie).toBe('default-cookie');
    expect(new URL(requests[0].url).searchParams.get('q')).toContain("rain');");
    expect((globalThis as any).compromised).toBeUndefined();
  });
  it('separates persisted source preferences from disposable VM state', async () => {
    const engine = await getQuickJS();
    const code = `class DefaultExtension extends MProvider {getHeaders(){const p=new SharedPreferences(); const old=p.getString('key','first');p.setString('key','next');return {old};}}`;
    const context = { source: {}, preferences: {} };
    const first = await evaluateMangayomi(engine, code, 'getHeaders', [], context, async () => { throw Error('Unexpected network'); }, createMangayomiDom());
    expect(first.value.old).toBe('first'); expect(first.preferences).toEqual({ key: 'next' }); expect(context.preferences).toEqual({});
    const next = await evaluateMangayomi(engine, code, 'getHeaders', [], { source: {}, preferences: first.preferences }, async () => { throw Error('Unexpected network'); }, createMangayomiDom());
    expect(next.value.old).toBe('next');
    await expect(evaluateMangayomi(engine, 'class DefaultExtension extends MProvider {getHeaders(){return new Document("<p>x</p>").xpath("//p");}}', 'getHeaders', [], context, async () => { throw Error('Unexpected network'); }, createMangayomiDom())).rejects.toThrow('XPath');
  });
  it('does not silently map volume/year or ambiguous entry labels to chapters', () => {
    expect(mangayomiEntryNumber('Vol. 2 Ch. 17 - Return')).toBe(17);
    expect(mangayomiEntryNumber('Season 3 Episode 12')).toBe(12);
    expect(mangayomiEntryNumber('Chapter 6.5')).toBe(6.5);
    expect(mangayomiEntryNumber('Vol. 2020')).toBeUndefined();
    expect(mangayomiEntryNumber('Ch 1 / Ch 2')).toBeUndefined();
    expect(mangayomiEntryNumber('Unnamed', 0)).toBe(0);
    expect(isMangayomiRepositoryMetadata([{ id: 1, sourceCodeLanguage: 0, sourceCodeUrl: 'https://repo.test/source.dart' }])).toBe(true);
    expect(isMangayomiRepositoryMetadata({ sourceName: 'Sora' })).toBe(false);
  });
});
