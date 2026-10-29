import './profile-chrome.css';
import { useEffect } from 'react';
import type { ProfilePalette } from './theme-palette';

/** Keep native window controls readable, restore the prior chrome on navigation. */
export function useProfileChrome(palette:ProfilePalette,themeId:string){
 const key=JSON.stringify(palette);
 useEffect(()=>{
  if(themeId==='default')return;
  const root=document.documentElement;const names=['--profile-chrome-bg','--profile-chrome-ink','--profile-chrome-accent','--profile-chrome-border'];
  const old=names.map(name=>root.style.getPropertyValue(name));const previous=root.dataset.profileChrome;
  [palette.panel,palette.ink,palette.primary,palette.border].forEach((value,i)=>root.style.setProperty(names[i],value));root.dataset.profileChrome=themeId;
  return ()=>{names.forEach((name,i)=>old[i]?root.style.setProperty(name,old[i]):root.style.removeProperty(name));if(previous)root.dataset.profileChrome=previous;else delete root.dataset.profileChrome;};
 },[key,themeId]);
}
