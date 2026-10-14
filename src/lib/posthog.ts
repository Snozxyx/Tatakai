// A bounded events-only client. No autocapture, replay, identities, URLs,
// request bodies, authentication data, or synchronously loaded analytics SDK.
const key=String(import.meta.env.VITE_POSTHOG_KEY || '');
const host=String(import.meta.env.VITE_POSTHOG_HOST || '');
const queue:Record<string,unknown>[]=[];
const id=typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : 'anonymous';
let timer:ReturnType<typeof setTimeout>|undefined;
function allowed(){return Boolean(key && host && typeof navigator!=='undefined' && navigator.onLine && navigator.doNotTrack!=='1' && !(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl);}
export function captureProductEvent(event:'page_view'|'app_started',properties:Record<string,string>={}) {
  if(!allowed() || queue.length>=25)return;
  const safe:Record<string,string>={};
  for(const field of ['surface','route_group'])if(properties[field])safe[field]=properties[field].slice(0,40);
  const runtime=window as Window & {electron?:unknown;Capacitor?:{isNativePlatform?:()=>boolean}};
  safe.surface=safe.surface||(runtime.electron?'desktop':runtime.Capacitor?.isNativePlatform?.()?'mobile':'web');
  queue.push({event,properties:{...safe,app_version:'6.1.1',distinct_id:id,$process_person_profile:false}});
  if(!timer)timer=setTimeout(()=>{timer=undefined;void flush();},5000);
}
async function flush(){
  if(!allowed()){queue.length=0;return;}
  const batch=queue.splice(0,25);
  try{const url=new URL('/batch/',host);if(url.protocol!=='https:'&&url.hostname!=='localhost')return;await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key,batch}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(3000)});}catch{/* Telemetry must never interfere with the application. */}
}
const routeGroups=new Set(['home','search','anime','manga','novel','watch','read','auth','settings','profile','community','library','extensions','playlists','status','faq','onboarding']);
export function routeGroup(path:string){const part=path.split('?')[0].split('/').filter(Boolean)[0] || 'home';return routeGroups.has(part)?part:'other';}
