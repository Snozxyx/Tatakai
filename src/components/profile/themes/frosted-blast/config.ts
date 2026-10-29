import { heavenDefaults, readHeavenConfig, type HeavenConfig } from '../eyes-toward-heaven/config';
export interface FrostedConfig extends HeavenConfig { backgroundUrl:string; seed:string }
export const frostedDefaults=():FrostedConfig=>({...heavenDefaults(),motion:false,backgroundUrl:'',seed:'#668eae'});
export function readFrostedConfig(value:unknown):FrostedConfig|null {
 const base=readHeavenConfig(value);if(!base)return null;const v=value as Record<string,unknown>;let backgroundUrl='';
 if(typeof v.backgroundUrl==='string' && v.backgroundUrl.length<=2048)try{const u=new URL(v.backgroundUrl);if(u.protocol==='https:'&&!u.username&&!u.password)backgroundUrl=u.href;}catch{/* Ignore invalid URLs. */}
 return {...base,motion:false,backgroundUrl,seed:typeof v.seed==='string'&&/^#[\da-f]{6}$/i.test(v.seed)?v.seed:'#668eae'};
}
