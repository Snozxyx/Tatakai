/** Event parsing for the older libass bridge; text and override tags stay untouched. */
export function parseAssEvents(script: string) {
  let fields = ['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
  let events=false;
  const result: Array<Record<string,string>>=[];
  for(const line of script.replace(/\r/g,'').split('\n')) {
    if(line.trim().startsWith('[')) events=line.trim().toLowerCase()==='[events]';
    if(events && /^Format:/i.test(line)) fields=line.slice(7).split(',').map(field=>field.trim().toLowerCase());
    if(!/^Dialogue:/i.test(line))continue;
    const raw=line.slice(9).trimStart();const values=[];let at=0;
    for(let i=0;i<fields.length-1;i++){const next=raw.indexOf(',',at);if(next<0)break;values.push(raw.slice(at,next));at=next+1;}
    values.push(raw.slice(at));if(values.length!==fields.length)continue;
    result.push(Object.fromEntries(fields.map((field,i)=>[field,values[i]])));
  }
  return result;
}
export function assTimeMilliseconds(value: string) {
  const parts=value.trim().split(':');if(parts.length===4)parts.splice(2,2,parts[2]+'.'+parts[3]);
  return parts.length===3?Math.round((Number(parts[0])*3600+Number(parts[1])*60+Number(parts[2]))*1000):0;
}
