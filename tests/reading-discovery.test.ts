import {expect,test} from 'bun:test';
import {discoverReadingBatches} from '../src/core/content/reading-discovery';
const batch=(number:number)=>({chapters:[{number}],providersAvailable:['fixture'],failedProviders:[]});
test('slow local sources do not block a fast server and later results are retained',async()=>{
 let finish!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{finish=resolve;});
 const tasks={server:async()=>{calls++;return batch(1);},slow:async()=>{await gate;return batch(2);}};
 const first=await discoverReadingBatches('fixture-'+Math.random(),tasks);
 expect(first[0].chapters[0].number).toBe(1);expect(first[1].pending).toBe(true);
 finish();await new Promise(resolve=>setTimeout(resolve,0));expect(calls).toBe(1);
});
test('unfinished server snapshots are refreshed without rescanning finished local sources',async()=>{
 let calls=0,local=0;const key='refresh-'+Math.random();
 const tasks={local:async()=>{local++;return batch(1);},server:async()=>({...batch(++calls+1),pending:calls===1})};
 const first=await discoverReadingBatches(key,tasks);expect(first[1].pending).toBe(true);
 const final=await discoverReadingBatches(key,tasks);expect(final[1].pending).toBe(false);expect(final[1].chapters[0].number).toBe(3);expect(local).toBe(1);
});
