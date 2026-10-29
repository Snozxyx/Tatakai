import { useTranslation } from 'react-i18next';
import { BookOpen, Cloud, Flower2, Leaf, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CachedProfileImage } from '@/components/ui/cached-profile-image';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { HEAVEN_POSTER, readHeavenConfig } from './eyes-toward-heaven/config';
import { readFrostedConfig } from './frosted-blast/config';
import { paletteFromSeed, paletteStyles, profilePalettes } from './theme-palette';
import { useProfileChrome } from './profile-chrome';
import type { ThemeLoadingProps } from './types';
import './theme-arrival.css';

function ThemeArrival({configuration,owner,id}:{id:string}&ThemeLoadingProps){
 const {t}=useTranslation();const reduced=useMotionPreference();
 const custom=id==='frosted-blast'?readFrostedConfig(configuration):null;
 const sky=id==='eyes-toward-heaven'?readHeavenConfig(configuration):null;
 const palette=custom?paletteFromSeed(custom.seed):sky?.palette==='lavender'?paletteFromSeed('#8264ad'):sky?.palette==='sage'?paletteFromSeed('#5f8b75'):profilePalettes[id]||profilePalettes['eyes-toward-heaven'];
 useProfileChrome(palette,id);
 const image=custom?.backgroundUrl||(['eyes-toward-heaven','frosted-blast'].includes(id)?HEAVEN_POSTER:null);
 const Icon=id==='sakura-letter'?Flower2:id==='cloud-notebook'?Cloud:id==='komorebi'?Leaf:id==='default'?BookOpen:Sparkles;
 return <section className="pt-arrival" data-theme={id} data-motion={!reduced} style={id==='default'?undefined:paletteStyles(palette)} role="status" aria-live="polite" aria-busy="true">
  {image&&<img className="pt-arrival-background" src={image} alt=""/>}<div className="pt-arrival-wash"/>
  <div className="pt-arrival-top" aria-hidden="true"><span>tatakai<span>✦</span></span><i/><i/><i/></div>
  <div className="pt-arrival-scene"><div className="pt-arrival-orbit" aria-hidden="true"><i/><i/><i/></div><div className="pt-arrival-card"><div className="pt-arrival-symbol" aria-hidden="true">{id==='uchiha'?<svg viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="37"/><circle cx="50" cy="50" r="10"/>{[0,120,240].map(deg=><path key={deg} transform={`rotate(${deg} 50 50)`} d="M50 19c16 0 21 14 8 24 1-12-7-13-8-24Z" fill="currentColor"/>)}</svg>:<Icon size={38}/>}</div><div className="pt-arrival-owner">{owner?.avatar_url&&<CachedProfileImage src={owner.avatar_url} alt=""/>}<span>{owner?.display_name||owner?.username||t('profileLoading.traveler')}</span></div><h1>{t(`profileLoading.${id}`)}</h1><p>{t('profileLoading.preparing')}</p><div className="pt-arrival-cards" aria-hidden="true">{[0,1,2].map(i=><div key={i}><Skeleton className="pt-arrival-cover"/><Skeleton className="pt-arrival-line"/></div>)}</div><span className="pt-arrival-progress" aria-hidden="true"><i/></span></div></div>
  <p className="pt-arrival-footer">{t('profileLoading.loading')}</p>
 </section>;
}
export const DefaultArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="default"/>;
export const SakuraLetterArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="sakura-letter"/>;
export const CloudNotebookArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="cloud-notebook"/>;
export const HeavenArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="eyes-toward-heaven"/>;
export const FrostedArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="frosted-blast"/>;
export const UchihaArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="uchiha"/>;
export const KomorebiArrival=(props:ThemeLoadingProps)=><ThemeArrival {...props} id="komorebi"/>;
