import { findCustomEmoji } from '@/lib/customEmoji';
export function CustomEmojiImage({ token }: { token: string }) {
  const item = findCustomEmoji(token);
  if (!item) return null;
  const mascot = item.group === 'mascots';
  return <img src={item.src} alt={item.name} title={item.name} loading="lazy" decoding="async"
    width={item.width || undefined} height={item.height || undefined}
    className={mascot ? 'tatakai-mascot-sticker' : 'tatakai-custom-emoji'} />;
}
