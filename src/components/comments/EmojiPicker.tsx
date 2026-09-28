import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Smile } from 'lucide-react';

/**
 * A dependency-free emoji picker: a curated, safe-for-work set grouped by
 * category. Selecting one inserts the raw unicode character into the composer.
 * Not exhaustive by design — the goal is quick reactions, not a full keyboard.
 */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '😎', '🤩', '😭', '😢', '😅', '😉', '🙃', '😴', '🤔', '😤', '😱', '🥹', '🥳', '😇', '🤯', '😳', '🫠', '😏', '🙄'],
  },
  {
    label: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '🫶', '👀', '🫡', '✌️', '🤞', '👌', '🤙', '👋', '🤟'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💖', '💗', '💘', '💝', '💯', '✨'],
  },
  {
    label: 'Anime',
    emojis: ['🔥', '⚔️', '🗡️', '🌸', '🍥', '⭐', '🌟', '💫', '🎌', '👺', '🐉', '🥷', '🎭', '📺', '🍜', '🎮'],
  },
  {
    label: 'Reactions',
    emojis: ['😂', '💀', '👽', '🤡', '🎉', '🎊', '🤌', '🧠', '🫥', '😈', '🤖', '🥶', '🥵', '🤪', '😬', '🫢'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger: React.ReactNode;
}

export function EmojiPicker({ onSelect, trigger }: EmojiPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <ScrollArea className="h-64">
          <div className="p-3 space-y-3">
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
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
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export { Smile as EmojiIcon };
