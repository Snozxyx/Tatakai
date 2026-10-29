import { Node } from '@tiptap/core';
import { CUSTOM_EMOJI, customEmojiToken } from '@/lib/customEmoji';
const find = (key: string) => CUSTOM_EMOJI.find(item => item.key === key);
/** Persist an allowlisted token; the editor preview alone uses an image node view. */
export const CustomEmojiNode = Node.create({
  name: 'customEmoji', inline: true, group: 'inline', atom: true,
  addAttributes() { return { key: { default: '' } }; },
  parseHTML() { return [{ tag: 'span[data-custom-emoji]', getAttrs: element => {
    const key = (element as HTMLElement).getAttribute('data-custom-emoji') || '';
    return find(key) ? { key } : false;
  } }]; },
  renderHTML({ node }) {
    const item = find(node.attrs.key);
    return ['span', { 'data-custom-emoji': item?.key || '' }, item ? customEmojiToken(item) : ''];
  },
  renderText({ node }) { const item = find(node.attrs.key); return item ? customEmojiToken(item) : ''; },
  addNodeView() { return ({ node }) => {
    const dom = document.createElement('span'); dom.contentEditable = 'false';
    const item = find(node.attrs.key);
    if (item) {
      const image = document.createElement('img'); image.src = item.src; image.alt = item.name;
      image.className = item.group === 'mascots' ? 'tatakai-mascot-sticker' : 'tatakai-custom-emoji';
      if (item.width) image.width = item.width;
      if (item.height) image.height = item.height;
      dom.appendChild(image);
    }
    return { dom };
  }; },
});
