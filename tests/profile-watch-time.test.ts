import {test,expect} from 'bun:test';
import {watchTimeSeconds} from '../src/lib/profileWatchTime';
test('profile totals do not count unwatched episodes or playback beyond duration',()=>{
 expect(watchTimeSeconds([{progress_seconds:60,duration_seconds:120},{progress_seconds:0,duration_seconds:1000,completed:false},{progress_seconds:0,duration_seconds:100,completed:true},{progress_seconds:300,duration_seconds:200},{progress_seconds:-1},{progress_seconds:NaN}])).toBe(360);
});
