/** Saved playback positions, excluding unwatched durations and invalid values. */
export function watchTimeSeconds(rows: readonly {progress_seconds?: number|null;duration_seconds?: number|null;completed?:boolean|null}[]): number {
  return rows.reduce((total,row)=>{
    const progress=Number(row.progress_seconds),duration=Number(row.duration_seconds);
    if(Number.isFinite(progress)&&progress>0)return total+(Number.isFinite(duration)&&duration>0?Math.min(progress,duration):progress);
    return total+(row.completed&&Number.isFinite(duration)&&duration>0?duration:0);
  },0);
}
