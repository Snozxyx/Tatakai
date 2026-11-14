import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { galleryImageUrl } from '@/lib/pornhwaIdentity';
import { pornhwaChapterAppearances, type PornhwaSeries } from '@/lib/pornhwaChapters';
import '@/pages/adult/adult-surfaces.css';

export function PornhwaChapterDetails({ series, chapterNumber, hideSpoilers }: { series: PornhwaSeries | null | undefined; chapterNumber: number | null; hideSpoilers: boolean }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [chapterNumber, hideSpoilers]);
  const details = pornhwaChapterAppearances(series, chapterNumber);
  if (!details || (!details.characters.length && !details.tags.length)) return null;
  const visible = !hideSpoilers || revealed;
  return <div className="pornhwa-chapter-details" data-chapter-appearances={chapterNumber}>
    {details.characters.length > 0 && <div className="pornhwa-chapter-characters" aria-label="Characters in this chapter">
      {details.characters.map(character => <Link key={character.id} className="pornhwa-chapter-character" title={character.name} aria-label={'Gallery for ' + character.name + ' in chapter ' + chapterNumber}
        to={'/adult/gallery?' + new URLSearchParams({ pornhwaIds: series!.identity.pornhwaId, characterIds: String(character.id), chapters: String(chapterNumber) })}>
        {character.image ? <img width={32} height={32} loading="lazy" src={galleryImageUrl(character.image)} alt="" /> : <span className="pornhwa-character-placeholder">{character.name.slice(0, 1)}</span>}
        <span>{character.name}</span>
      </Link>)}
    </div>}
    {details.tags.length > 0 && <div className="pornhwa-chapter-scenes">
      {hideSpoilers && <button type="button" aria-expanded={visible} className="pornhwa-spoiler-toggle" onClick={() => setRevealed(value => !value)}>
        {visible ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}{visible ? 'Hide scene details' : 'Show scene spoilers'}
      </button>}
      {visible && <div className="pornhwa-scene-tags" aria-label="Chapter scene details">{details.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
    </div>}
  </div>;
}
