export interface CommentQuoteDraft { id: string; text: string; }

export function appendCommentQuote(content: string, text: string): string {
  const quote = text.replace(/\r\n?/g, '\n').trim().slice(0, 2000);
  if (!quote) return content;
  const block = quote.split('\n').map(line => `> ${line}`).join('\n');
  return `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${block}\n\n`;
}

export function splitCommentBlocks(content: string): Array<{ quote: boolean; text: string }> {
  const blocks: Array<{ quote: boolean; text: string }> = [];
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    const quote = /^(?:>|&gt;) ?/.test(line);
    // The existing comment sanitizer HTML-escapes text. Decode quote text once
    // into a plain React string; it is never interpreted as HTML or markup.
    const quotedText = quote ? line.replace(/^(?:>|&gt;) ?/, '') : line;
    const text = line.startsWith('&gt;') ? quotedText.replace(/&(amp|lt|gt|quot|#39|#x27);/gi, entity => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'",
    })[entity.toLowerCase()] || entity) : quotedText;
    const previous = blocks[blocks.length - 1];
    if (previous?.quote === quote) previous.text += `\n${text}`;
    else blocks.push({ quote, text });
  }
  return blocks;
}
