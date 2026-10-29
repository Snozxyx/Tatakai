import { useState } from 'react';
import { CUSTOM_EMOJI, customEmojiToken } from '@/lib/customEmoji';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Smile } from 'lucide-react';

/**
 * A dependency-free emoji picker: a curated, safe-for-work set grouped by
 * category. Selecting one inserts the raw unicode character into the composer.
 * Not exhaustive by design — the goal is quick reactions, not a full keyboard.
 */
const EMOJI_GROUPS: { labelKey: string; emojis: string[] }[] = [
  {
    labelKey: 'comments.emojiSmileys',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '😎', '🤩', '😭', '😢', '😅', '😉', '🙃', '😴', '🤔', '😤', '😱', '🥹', '🥳', '😇', '🤯', '😳', '🫠', '😏', '🙄'],
  },
  {
    labelKey: 'comments.emojiGestures',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '🫶', '👀', '🫡', '✌️', '🤞', '👌', '🤙', '👋', '🤟'],
  },
  {
    labelKey: 'comments.emojiHearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💖', '💗', '💘', '💝', '💯', '✨'],
  },
  {
    labelKey: 'comments.emojiAnime',
    emojis: ['🔥', '⚔️', '🗡️', '🌸', '🍥', '⭐', '🌟', '💫', '🎌', '👺', '🐉', '🥷', '🎭', '📺', '🍜', '🎮'],
  },
  {
    labelKey: 'comments.emojiReactions',
    emojis: ['😂', '💀', '👽', '🤡', '🎉', '🎊', '🤌', '🧠', '🫥', '😈', '🤖', '🥶', '🥵', '🤪', '😬', '🫢'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger: React.ReactNode;
}

export function EmojiPicker({ onSelect, trigger }: EmojiPickerProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const [category, setCategory] = useState<'unicode' | 'custom' | 'mascots'>('unicode');
  const [search, setSearch] = useState('');
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex flex-col gap-2 p-2">
          <ToggleGroup type="single" value={category} onValueChange={value => { if (value === 'unicode' || value === 'custom' || value === 'mascots') setCategory(value); }} aria-label={t('comments.emojiCategories')} className="w-full">
            {(['unicode', 'custom', 'mascots'] as const).map(value => <ToggleGroupItem key={value} value={value} size="sm" className="flex-1">{t(`comments.emoji${value === 'unicode' ? 'Standard' : value === 'custom' ? 'Custom' : 'Mascots'}`)}</ToggleGroupItem>)}
          </ToggleGroup>
          {category !== 'unicode' && <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('comments.emojiSearch')} aria-label={t('comments.emojiSearch')} />}
        </div>
        <ScrollArea className="h-64">
          <div className="flex flex-col gap-3 p-3">
            {category === 'unicode' && EMOJI_GROUPS.map((group) => (
              <div key={group.labelKey}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(group.labelKey)}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => onSelect(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {category !== 'unicode' && <div className={category === 'mascots' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-5 gap-1'}>
              {CUSTOM_EMOJI.filter(item => item.group === category && item.name.toLowerCase().includes(search.toLowerCase())).map(item => <button type="button" key={item.key} title={item.name} aria-label={item.name} onClick={() => onSelect(customEmojiToken(item))} className="flex min-h-11 items-center justify-center rounded-md p-1 hover:bg-accent focus-visible:outline focus-visible:outline-primary">
                <img src={item.src} alt="" loading="lazy" decoding="async" className={category === 'mascots' ? 'h-auto max-h-28 max-w-full object-contain' : 'size-9 object-contain'} />
              </button>)}
              {!CUSTOM_EMOJI.some(item => item.group === category && item.name.toLowerCase().includes(search.toLowerCase())) && <p className="col-span-full text-sm text-muted-foreground">{t('comments.emojiEmpty')}</p>}
            </div>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export { Smile as EmojiIcon };
