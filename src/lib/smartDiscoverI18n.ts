import uiI18n from './uiI18n';

const LANG = () => (uiI18n.language?.startsWith('es') ? 'es' : 'en');

/** AniList genre EN -> ES display names (report: Explore Genres grid). */
export const GENRE_ES: Record<string, string> = {
  Action: 'Acción',
  Adventure: 'Aventura',
  Comedy: 'Comedia',
  Drama: 'Drama',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasía',
  Horror: 'Terror',
  'Mahou Shoujo': 'Mahou Shoujo',
  Mecha: 'Mecha',
  Music: 'Música',
  Mystery: 'Misterio',
  Psychological: 'Psicológico',
  Romance: 'Romance',
  'Sci-Fi': 'Sci-Fi',
  'Slice of Life': 'Slice of Life',
  Sports: 'Deportes',
  Supernatural: 'Sobrenatural',
  Thriller: 'Suspenso',
};

export function translateGenre(genre: string, lang?: string): string {
  const l = (lang || LANG()).split('-')[0];
  if (l !== 'es') return genre;
  return GENRE_ES[genre] ?? genre;
}

/** Smart Discover variant hints ("Ranked by your taste + shelf", …). */
export function smartHint(variant: 'best' | 'gem' | 'trending', lang?: string): string {
  const es = ((lang || LANG()).split('-')[0] === 'es');
  if (es) {
    if (variant === 'best') return 'Clasificado según tus gustos + estante';
    if (variant === 'gem') return 'Nota alta, pocos lectores';
    return 'Lo que los lectores leen hoy';
  }
  if (variant === 'best') return 'Ranked by your taste + shelf';
  if (variant === 'gem') return 'High score, few readers';
  return 'What readers open today';
}

/** Normalised publication status for manga/novel cards. */
export function formatSmartStatus(status?: string | null, lang?: string): string | null {
  const s = String(status || '').toUpperCase();
  const es = ((lang || LANG()).split('-')[0] === 'es');
  const pick = (en: string, esLabel: string) => (es ? esLabel : en);
  if (s.includes('RELEAS') || s.includes('PUBLISH')) return pick('Ongoing', 'En curso');
  if (s.includes('FINISH') || s.includes('COMPLET')) return pick('Completed', 'Completado');
  if (s.includes('HIATUS')) return pick('Hiatus', 'En pausa');
  if (s.includes('NOT_YET') || s.includes('UPCOMING')) return pick('Upcoming', 'Próximamente');
  return null;
}

/** Locale-aware compact number (report: avoid hardcoded "en"). */
export function compactNum(n: number, lang?: string): string {
  try {
    const l = (lang || LANG()).split('-')[0] === 'es' ? 'es' : 'en';
    return new Intl.NumberFormat(l, { notation: 'compact' }).format(n);
  } catch {
    return String(n);
  }
}

export interface SmartReasonInput {
  genre: string;
  topTasteGenre?: string | null;
  dominantFormat?: string | null;
  mediaType?: string | null;
  score?: number | null;
  popularity?: number | null;
  status?: string | null;
  chapters?: number | null;
  variant: 'best' | 'gem' | 'trending';
  lang?: string;
}

/** Localised "why this pick" bullets for Smart Discover. */
export function smartReasons(input: SmartReasonInput): string[] {
  const es = ((input.lang || LANG()).split('-')[0] === 'es');
  const out: string[] = [];
  if (input.genre !== 'all') {
    out.push(
      input.genre === input.topTasteGenre
        ? es
          ? `${translateGenre(input.genre, 'es')} — tu género favorito`
          : `${input.genre} — your top taste genre`
        : es
          ? `De ${translateGenre(input.genre, 'es')}, filtrado por ti`
          : `In ${input.genre}, filtered by you`,
    );
  } else if (input.topTasteGenre) {
    out.push(
      es
        ? `Combina con tu gusto por ${translateGenre(input.topTasteGenre, 'es')}`
        : `Pairs with your taste for ${input.topTasteGenre}`,
    );
  }
  if (input.dominantFormat && String(input.mediaType || '').toLowerCase() === input.dominantFormat) {
    out.push(
      es
        ? `Encaja en tu estante — sobre todo ${input.dominantFormat}`
        : `Fits your shelf — mostly ${input.dominantFormat}`,
    );
  }
  if (typeof input.score === 'number' && input.score >= 75) {
    out.push(
      es
        ? `Valorado con ${(input.score / 10).toFixed(1)}/10 por los lectores`
        : `Rated ${(input.score / 10).toFixed(1)}/10 by readers`,
    );
  }
  if (input.variant === 'gem' && typeof input.popularity === 'number') {
    out.push(
      es
        ? `Poco conocido — solo ${compactNum(input.popularity, input.lang)} seguimientos`
        : `Under the radar — only ${compactNum(input.popularity, input.lang)} follows`,
    );
  } else if (typeof input.popularity === 'number' && input.popularity > 0 && input.variant !== 'gem') {
    out.push(
      es
        ? `Les encanta a ${compactNum(input.popularity, input.lang)} lectores`
        : `Loved by ${compactNum(input.popularity, input.lang)} readers`,
    );
  }
  const pretty = formatSmartStatus(input.status, input.lang);
  if (pretty === (es ? 'Completado' : 'Completed')) {
    out.push(es ? 'Completado — para darte un atracón' : 'Completed — binge it cover to cover');
  } else if (pretty === (es ? 'En curso' : 'Ongoing')) {
    out.push(es ? 'En curso — con capítulos nuevos' : 'Ongoing — fresh chapters keep landing');
  }
  if (typeof input.chapters === 'number' && input.chapters > 0) {
    out.push(es ? `${input.chapters} capítulos por explorar` : `${input.chapters} chapters to explore`);
  }
  return out.slice(0, 4);
}
