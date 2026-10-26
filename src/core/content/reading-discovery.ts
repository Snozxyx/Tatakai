import { extensionDeadline } from '../extensions/remote/deadline';
import { EXTENSION_INSTALLED_EVENT } from '../extensions/ecosystems';

type Batch = { chapters: any[]; providersAvailable: string[]; failedProviders: string[]; pending?: boolean };
const empty = (): Batch => ({chapters:[],providersAvailable:[],failedProviders:[]});
const cache = new Map<string,{at:number;done:boolean;value:Batch;promise:Promise<void>}>();
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(EXTENSION_INSTALLED_EVENT, () => cache.clear());
  window.addEventListener('storage', () => cache.clear());
}
/** Publish available reading sources while slower discovery continues once. */
export async function discoverReadingBatches(key:string, tasks:Record<string,()=>Promise<Batch>>):Promise<Batch[]> {
  const records=Object.entries(tasks).map(([name,run])=>{
    const id=key+':'+name;let record=cache.get(id);
    if (!record || (record.done && (record.value.pending || Date.now()-record.at>(record.value.failedProviders.length && !record.value.chapters.length ? 30000 : 300000)))) {
      // A bounded number of titles may run at once; never evict active work.
      for(const [old,value] of cache) if(value.done && Date.now()-value.at>300000) cache.delete(old);
      if(cache.size>=128) {const oldest=[...cache].find(([,value])=>value.done);if(oldest)cache.delete(oldest[0]);}
      if(cache.size>=128) return {at:Date.now(),done:true,value:{...empty(),failedProviders:[name]},promise:Promise.resolve()};
      const next={at:Date.now(),done:false,value:empty(),promise:Promise.resolve()};
      next.promise=extensionDeadline(()=>run(),25000).then(value=>{next.value=value;},()=>{next.value={...empty(),failedProviders:[name]};}).finally(()=>{next.done=true;});
      cache.set(id,next);record=next;
    }
    return record;
  });
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {await Promise.race([Promise.all(records.map(row=>row.promise)),new Promise(resolve=>{timer=setTimeout(resolve,600);})]);}
  finally {clearTimeout(timer);}
  // Copy collections: a late native callback must not mutate returned snapshots.
  return records.map(row=>({...row.value,chapters:row.value.chapters.map(chapter=>({...chapter,...(Array.isArray(chapter.sources)?{sources:chapter.sources.map((source:any)=>({...source}))}:{})})),pending:!row.done || !!row.value.pending}));
}
