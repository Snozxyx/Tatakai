import {test,expect} from 'bun:test';
import {isWatchPartyShareUrl} from '../src/core/player/watch-party-url';
test('only host tunnel stream tokens bypass additional streaming proxies',()=>{
 const token='a'.repeat(32);
 const share=`https://party.trycloudflare.com/stream/${token}?s=secret`;
 expect(isWatchPartyShareUrl(share)).toBe(true);
 for(const url of [`http://party.trycloudflare.com/stream/${token}?s=x`,`https://party.trycloudflare.com.evil.test/stream/${token}?s=x`,`https://party.trycloudflare.com/stream/${token}`,`https://cdn.test/stream/${token}?s=x`])expect(isWatchPartyShareUrl(url)).toBe(false);
 expect(new URL(`/stream/${'b'.repeat(32)}?s=secret`,share).origin).toBe(new URL(share).origin);
});
