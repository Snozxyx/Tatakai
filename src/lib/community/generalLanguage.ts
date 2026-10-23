import { detectPostLanguage } from './detectLanguage';

export function detectGeneralCommunityLanguage(content: string): string | null {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  doc.querySelectorAll('code, pre, blockquote, [data-mention], [data-hashtag]').forEach(node => node.remove());
  const sample = (doc.body.textContent || '').replace(/https?:\/\/\S+|@[\w]+|#[\w]+|`[^`]*`|^>.*$/gm, ' ').trim();
  // Short anime names, links and greetings are too ambiguous to warn about.
  const minimum = /[\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff]/u.test(sample) ? 10 : 40;
  if ((sample.match(/\p{L}/gu) || []).length < minimum) return null;
  const language = detectPostLanguage(sample.slice(0, 2000));
  return language && language !== 'en' ? language : null;
}
