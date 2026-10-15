import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {watchTimeSeconds} from '@/lib/profileWatchTime';

/** Shared by peek and full profile; RLS still controls whose history is visible. */
export function useProfileWatchTime(userId?:string|null,enabled=true){
  const query = useQuery({queryKey:['profile-watch-time',userId],enabled:enabled&&!!userId,staleTime:30_000,
    queryFn:async({signal})=>{
      let seconds=0,offset=0;
      while(true){
        const {data,error}=await supabase.from('watch_history').select('id,progress_seconds,duration_seconds,completed')
          .eq('user_id',userId!).order('id').range(offset,offset+499).abortSignal(signal);
        if(error)throw error;if(!data?.length)break;
        seconds+=watchTimeSeconds(data);offset+=data.length;
      }
      return seconds;
    }});
  return {...query,data:enabled?query.data:undefined};
}
