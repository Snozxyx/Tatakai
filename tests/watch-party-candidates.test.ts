import {test,expect,mock} from 'bun:test';
mock.module('../src/hooks/user/useProxySettings',()=>({getAllActiveProxyUrls:()=>['https://proxy.invalid'],getActiveStreamingProxySnapshot:()=>({url:'https://proxy.invalid',password:''})}));
mock.module('../src/core/network/proxyChain',()=>({fetchViaChain:()=>{throw new Error('Unexpected proxy request');}}));
const {buildProxyCandidateUrls,buildMobilePlaybackCandidates}=await import('../src/core/player/stream-resolver');
test('desktop and mobile never disclose host share tokens to another proxy',()=>{
 const share=`https://host.trycloudflare.com/stream/${'a'.repeat(32)}?s=host-secret`;
 expect(buildProxyCandidateUrls(share,undefined,undefined,'https://proxy.invalid')).toEqual([share]);
 expect(buildMobilePlaybackCandidates(share,{proxiedUrl:'https://proxy.invalid'})).toEqual([share]);
});

test('server media capabilities stay on their own proxy for desktop and mobile',()=>{
 const media=`https://community.example/api/server/v1/media/${'a'.repeat(16)}.${'b'.repeat(64)}`;
 expect(buildProxyCandidateUrls(media,undefined,undefined,'https://proxy.invalid')).toEqual([media]);
 expect(buildMobilePlaybackCandidates(media,{proxiedUrl:'https://proxy.invalid'})).toEqual([media]);
});
