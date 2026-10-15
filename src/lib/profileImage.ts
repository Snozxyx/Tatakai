import {resolveBackendOrigin} from '@/lib/api/backendOrigin';

export function cachedProfileImageUrl(value?:string|null):string|undefined {
  if(!value)return undefined;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/token|signature|credential|authorization|^sig$|^key$|^auth$/i.test(k)))return value;
    if(url.pathname==='/api/v3/images/profile'||/\/storage\/v1\/object\/(?!public\/)/.test(url.pathname))return value;
    return `${resolveBackendOrigin()||'https://api.tatakai.me'}/api/v3/images/profile?${new URLSearchParams({url:value})}`;
  }catch{return value;}
}
