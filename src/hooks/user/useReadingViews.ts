import { randomUUID } from '../../lib/uuid';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ReadingMediaKind } from '@/lib/readingViewId';

type Pending={id:string;resolve:(count:number)=>void;reject:(error:unknown)=>void};
const queues=new Map<ReadingMediaKind,Pending[]>();
function countFor(kind:ReadingMediaKind,id:string):Promise<number>{
  return new Promise((resolve,reject)=>{
    const pending=queues.get(kind);
    if(pending){pending.push({id,resolve,reject});return;}
    queues.set(kind,[{id,resolve,reject}]);
    setTimeout(async()=>{
      const work=queues.get(kind)??[];queues.delete(kind);
      try{
        const counts=new Map<string,number>();
        const ids=[...new Set(work.map(item=>item.id))];
        for(let offset=0;offset<ids.length;offset+=100){
          const {data,error}=await (supabase as any).from('reading_view_counts').select('media_id,total_views').eq('media_kind',kind).in('media_id',ids.slice(offset,offset+100));
          if(error)throw error;
          for(const row of data??[])counts.set(row.media_id,Number(row.total_views));
        }
        work.forEach(item=>item.resolve(counts.get(item.id)??0));
      }catch(error){work.forEach(item=>item.reject(error));}
    },16);
  });
}
export function useReadingViewCount(kind:ReadingMediaKind,id?:string){
  return useQuery({queryKey:['reading-views',kind,id],queryFn:()=>countFor(kind,id!),enabled:!!id,staleTime:60000,retry:false});
}
export function useReadingViewTracker(kind:ReadingMediaKind,id?:string,ready=false){
  const cache=useQueryClient();
  useEffect(()=>{
    if(!ready||!id)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let recorded=false;
    const update=()=>{
      clearTimeout(timer);
      if(document.visibilityState!=='visible'||recorded)return;
      timer=setTimeout(async()=>{
        if(document.visibilityState!=='visible')return;
        recorded=true;
        try{
          let session=sessionStorage.getItem('tatakai-reading-session');
          if(!session){session=randomUUID();sessionStorage.setItem('tatakai-reading-session',session);}
          const {error}=await (supabase as any).rpc('record_reading_view',{p_kind:kind,p_media_id:id,p_session_id:session});
          if(!error)cache.invalidateQueries({queryKey:['reading-views',kind,id]});
        }catch{/* Analytics must not block reading. */}
      },10000);
    };
    update();document.addEventListener('visibilitychange',update);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);};
  },[kind,id,ready,cache]);
}
