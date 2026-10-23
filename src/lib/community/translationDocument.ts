/** Text-only translation slots; markup and social identifiers never go to an engine. */
import { decodeHtmlEntities } from '@/lib/commentMarkup';

export function preparePostTranslation(title: string, content: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString('', 'text/html');
  const titleElement = doc.createElement('h1');
  titleElement.textContent = title;
  const body = doc.createElement('div');
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  if (isHtml) body.innerHTML = content;
  // Plain posts: entity-encoded legacy rows must reach the engine as prose.
  else body.textContent = decodeHtmlEntities(content);
  doc.body.append(titleElement, body);

  const slots: Text[] = [];
  const texts: string[] = [];
  const protectedPattern =
    /(https?:\/\/[^\s]+|@[a-zA-Z0-9_]{2,30}|#[\p{L}\p{N}_]+)/gu;
  const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (
      node.parentElement?.closest(
        'script,style,code,pre,[data-mention],[data-hashtag],a'
      )
    )
      continue;
    const fragment = doc.createDocumentFragment();
    for (const part of (node.textContent || '').split(protectedPattern)) {
      const protectedText =
        /^https?:\/\/|^@|^#/u.test(part) || !/[\p{L}]/u.test(part);
      if (!isHtml && /^[@#]/u.test(part)) {
        const token = doc.createElement('span');
        token.setAttribute(
          part[0] === '@' ? 'data-mention' : 'data-hashtag',
          ''
        );
        token.setAttribute(
          part[0] === '@' ? 'data-label' : 'data-tag',
          part.slice(1)
        );
        token.textContent = part;
        fragment.append(token);
        continue;
      }
      // Bounded chunks prevent long posts from overflowing small-device model contexts.
      const chunks = protectedText
        ? [part]
        : part.match(/[\s\S]{1,240}(?:\s|$)|[\s\S]{1,240}/gu) || [part];
      for (const chunk of chunks) {
        const textNode = doc.createTextNode(chunk);
        fragment.append(textNode);
        if (protectedText || !/[\p{L}]/u.test(chunk)) continue;
        slots.push(textNode);
        texts.push(chunk);
      }
    }
    node.replaceWith(fragment);
  }
  return {
    texts,
    render(translations: string[]) {
      if (translations.length !== slots.length)
        throw new Error('Translation slot count mismatch');
      translations.forEach((translated, index) => {
        // Assign textContent, never HTML. Engine output cannot create links or scripts.
        const original = texts[index];
        const leading = original.match(/^\s*/)?.[0] || '';
        const trailing = original.match(/\s*$/)?.[0] || '';
        slots[index].textContent = leading + translated.trim() + trailing;
      });
      return {
        title: titleElement.textContent || '',
        content: isHtml
          ? body.innerHTML
          : `<p>${body.innerHTML.replace(/\r?\n/g, '<br>')}</p>`,
      };
    },
  };
}
