import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { externalEmbed, extractExternalEmbeds } from '../src/lib/community/externalLinks';
import { detectGeneralCommunityLanguage } from '../src/lib/community/generalLanguage';

const parser = globalThis.DOMParser;
beforeEach(() => { globalThis.DOMParser = new JSDOM('').window.DOMParser; });
afterEach(() => { globalThis.DOMParser = parser; });

describe('external community links', () => {
  test('recognizes YouTube URL variants and preserves start times', () => {
    for (const url of ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=90', 'https://youtube.com/shorts/dQw4w9WgXcQ?t=90']) {
      expect(externalEmbed(url)?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90');
    }
  });
  test('recognizes Reddit comments, Discord invites, Spotify and Vimeo', () => {
    expect(externalEmbed('https://old.reddit.com/r/anime/comments/abc123/title/def456/')?.src).toStartWith('https://www.redditmedia.com/r/anime/comments/abc123/title/def456/');
    expect(externalEmbed('https://discord.gg/tatakai')?.inviteCode).toBe('tatakai');
    expect(externalEmbed('https://discord.com/invite/tatakai')?.inviteCode).toBe('tatakai');
    expect(externalEmbed('https://discord.com/channels/123/456')?.provider).toBe('Discord');
    expect(externalEmbed('https://open.spotify.com/intl-es/track/abc123')?.src).toBe('https://open.spotify.com/embed/track/abc123');
    expect(externalEmbed('https://vimeo.com/12345')?.src).toBe('https://player.vimeo.com/video/12345');
  });
  test('rejects unsafe schemes and credentials, never frames lookalike hosts or arbitrary pages', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.com']) expect(externalEmbed(url)).toBeNull();
    for (const url of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://example.com/page', 'https://youtube.com/redirect?v=%22%3E']) expect(externalEmbed(url)?.src).toBeUndefined();
  });
  test('extracts legacy links, strips trailing punctuation, deduplicates and bounds cards', () => {
    expect(extractExternalEmbeds('See (https://youtu.be/dQw4w9WgXcQ). https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toHaveLength(1);
    expect(extractExternalEmbeds('https://a.test https://b.test https://c.test https://d.test')).toHaveLength(3);
  });
  test('finds rich-text anchors while excluding spoilers, quotes and code', () => {
    const html = '<p><a href="https://youtu.be/dQw4w9WgXcQ">Watch this</a></p><span data-spoiler>https://spoiler.test</span><code>https://code.test</code><blockquote>https://quote.test</blockquote>';
    expect(extractExternalEmbeds(html, true).map(embed => embed.provider)).toEqual(['YouTube']);
    expect(extractExternalEmbeds('<p>https://a.test</p><p>https://b.test</p>', true).map(embed => embed.url)).toEqual(['https://a.test/', 'https://b.test/']);
    expect(extractExternalEmbeds('||https://spoiler.test|| `https://code.test`\n> https://quote.test')).toEqual([]);
  });
});

describe('general community language advisory', () => {
  test('detects non-English prose and leaves English and ambiguous short drafts alone', () => {
    expect(detectGeneralCommunityLanguage('Me encantó ver este anime con mis amigos anoche. La historia es maravillosa.')).toBe('es');
    expect(detectGeneralCommunityLanguage('I really enjoyed watching this anime with my friends last night.')).toBeNull();
    expect(detectGeneralCommunityLanguage('Naruto Shippuden')).toBeNull();
    expect(detectGeneralCommunityLanguage('このアニメを友達と一緒に観るのがとても楽しかったです。')).toBe('ja');
    expect(detectGeneralCommunityLanguage('https://example.com/a-really-long-url-that-is-not-a-sentence')).toBeNull();
    expect(detectGeneralCommunityLanguage('<p>Hello</p><code>Me encantó ver este anime con mis amigos anoche. La historia es maravillosa.</code>')).toBeNull();
  });
});
