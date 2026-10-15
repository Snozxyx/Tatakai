import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { CharacterFavorite } from '@/hooks/user/useCharacterFavorites';

export interface OverviewFavoriteCharactersProps {
  characters?: CharacterFavorite[];
  isLoading?: boolean;
  isViewingOther?: boolean;
}

export function OverviewFavoriteCharacters({
  characters = [],
  isLoading = false,
  isViewingOther = false,
}: OverviewFavoriteCharactersProps) {
  useUiTranslation();
  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Heart className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              {isViewingOther ? uiI18n.t('app.favorite_characters_19b43ee2') : uiI18n.t('app.your_favorite_characters_d44ef486')}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">{uiI18n.t('app.characters_pinned_from_across_the_catalog_6b6474c7')}</p>
        </div>
        {characters.length > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground/80 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.05] uppercase tracking-wider shrink-0">
            {characters.length}
          </span>
        )}
      </div>

      <div className="relative z-10">
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[160px] text-center">
            <Heart className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">
              {isViewingOther ? uiI18n.t('app.no_favorite_characters_yet_1f903c95') : uiI18n.t('app.you_haven_t_favorited_any_characters_yet_a7864920')}
            </p>
            {!isViewingOther && (
              <p className="text-xs text-muted-foreground/40 mt-1">
                {uiI18n.t('app.tap_the_heart_on_a_character_page_to_add_them_he_67633ad4')}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {characters.map((c, idx) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.03, ease: 'easeOut' }}
              >
                <Link
                  to={`/character/${encodeURIComponent(c.character_id)}?name=${encodeURIComponent(c.character_name)}`}
                  className="group block"
                >
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/[0.05] bg-white/[0.02]">
                    {c.character_image ? (
                      <img
                        src={c.character_image}
                        alt={c.character_name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Heart className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                      <p className="text-[11px] font-semibold text-white truncate">{c.character_name}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
