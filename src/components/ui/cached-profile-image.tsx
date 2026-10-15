import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {cachedProfileImageUrl} from '@/lib/profileImage';

export function CachedProfileImage({src,onError,...props}:ImgHTMLAttributes<HTMLImageElement>){
  const [direct,setDirect]=useState(false);useEffect(()=>setDirect(false),[src]);
  const cached=cachedProfileImageUrl(src);
  return <img {...props} src={direct?src:cached} onError={event=>{
    if(!direct&&cached!==src){setDirect(true);return;}onError?.(event);
  }}/>;
}
