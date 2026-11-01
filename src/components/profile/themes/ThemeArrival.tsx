import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Cloud, Feather, Leaf, Mail, Snowflake, Sun } from 'lucide-react';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import type { ThemeLoadingProps } from './types';
import './theme-arrival.css';

// Only the accessible frame is shared. Each scene has its own composition.
function ArrivalFrame({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation(); const reduced = useMotionPreference();
  return <section className={`theme-entry theme-entry-${id}`} data-motion={!reduced} role="status" aria-live="polite" aria-busy="true">
    <div className="theme-entry-art" aria-hidden="true">{children}</div>
    <p>{t(`profileLoading.${id}`)}</p><span>{t('profileLoading.loading')}</span>
  </section>;
}
export const DefaultArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="default"><BookOpen size={64}/><div className="entry-book-lines"><i/><i/><i/></div></ArrivalFrame>;
export const SakuraLetterArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="sakura-letter"><div className="entry-envelope"><div className="entry-letter"><span>✿</span><i/><i/><i/></div><Mail size={112}/></div><span className="entry-petal">✿</span></ArrivalFrame>;
export const CloudNotebookArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="cloud-notebook"><div className="entry-notebook"><div className="entry-binding">○<br/>○<br/>○</div><Cloud size={42}/><i/><i/><i/></div></ArrivalFrame>;
export const HeavenArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="eyes-toward-heaven"><Sun size={64}/><div className="entry-horizon"/><Cloud className="entry-cloud" size={64}/></ArrivalFrame>;
export const FrostedArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="frosted-blast"><div className="entry-pane entry-pane-one"/><div className="entry-pane entry-pane-two"><Snowflake size={52}/></div></ArrivalFrame>;
export const UchihaArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="uchiha"><div className="entry-tomoe">{[0,120,240].map(angle => <i key={angle} style={{ transform:`rotate(${angle}deg) translateY(-28px)` }}/>)}</div><Feather className="entry-feather" size={48}/></ArrivalFrame>;
export const KomorebiArrival = (_: ThemeLoadingProps) => <ArrivalFrame id="komorebi"><div className="entry-sunbeam"/>{[0,1,2].map(i => <Leaf key={i} className={`entry-leaf entry-leaf-${i}`} size={44}/>)}</ArrivalFrame>;
