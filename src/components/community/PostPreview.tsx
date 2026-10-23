import { RichContent } from '@/components/community/feed/richText';
import { getProxiedImageUrl } from '@/lib/api';
import { ExternalLinkEmbeds } from '@/components/community/ExternalLinkEmbeds';

export function PostPreview({ title, content, rich = true, images = [], spoiler, poll, attachments = [] }: {
  title: string; content: string; rich?: boolean; images?: string[]; spoiler?: boolean;
  poll?: { choices: { text: string; image: string | null }[]; days: number; hours: number; minutes: number } | null;
  attachments?: string[];
}) {
  return <section aria-label="Post preview" className="my-4 space-y-3 rounded-xl border border-border p-4 break-words">
    <p className="text-sm font-medium text-muted-foreground">Preview · Only you can see this</p>
    {spoiler && <span className="text-xs font-semibold text-orange-400">Spoiler</span>}
    {title && <h3 className="text-lg font-bold">{title}</h3>}
    {rich ? <RichContent html={content} /> : <><p className="whitespace-pre-wrap">{content}</p><ExternalLinkEmbeds content={content} /></>}
    {images.map((url, i) => <img key={`${url}-${i}`} src={url.startsWith('data:') ? url : getProxiedImageUrl(url)} alt={`Post attachment ${i + 1}`} className="max-h-96 max-w-full rounded-lg object-contain" />)}
    {poll && <div className="space-y-2" aria-label="Poll preview">
      {poll.choices.filter((c) => c.text.trim()).map((choice, i) => <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-3">
        {choice.image && <img src={getProxiedImageUrl(choice.image)} alt="" className="h-10 w-10 rounded object-cover" />}{choice.text}
      </div>)}
      <p className="text-xs text-muted-foreground">Poll duration: {poll.days}d {poll.hours}h {poll.minutes}m</p>
    </div>}
    {attachments.map((label) => <p key={label} className="text-sm text-primary">{label}</p>)}
  </section>;
}
