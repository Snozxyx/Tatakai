/**
 * __tatakai_parse_html__ cheerio adapter tests
 * Requirements: 14.2
 */
import { describe, it, expect } from 'vitest';
import { __tatakai_parse_html__ } from '../../desktop/runtime/extension/extension-worker-pool.cjs';

describe('__tatakai_parse_html__', () => {
  it('returns text of a matched element', () => {
    const $ = __tatakai_parse_html__('<h1>Hello World</h1>');
    expect($.find('h1').text()).toBe('Hello World');
  });

  it('returns attribute of a matched element', () => {
    const $ = __tatakai_parse_html__('<a href="https://example.com">Link</a>');
    expect($.find('a').attr('href')).toBe('https://example.com');
  });

  it('iterates with each() and yields correct count', () => {
    const $ = __tatakai_parse_html__('<ul><li>A</li><li>B</li><li>C</li></ul>');
    let count = 0;
    $.find('li').each(() => { count++; });
    expect(count).toBe(3);
  });

  it('find().first() returns only the first match', () => {
    const $ = __tatakai_parse_html__('<div><span>First</span><span>Second</span></div>');
    expect($.find('span').first().text()).toBe('First');
  });

  it('html() returns inner HTML of first element', () => {
    const $ = __tatakai_parse_html__('<div><b>inner</b></div>');
    const inner = $.find('div').html();
    expect(inner).toContain('<b>inner</b>');
  });

  it('throws InvalidInputError for empty string', () => {
    expect(() => __tatakai_parse_html__('')).toThrow();
    try { __tatakai_parse_html__(''); } catch (e: any) { expect(e.name).toBe('InvalidInputError'); }
  });

  it('throws InvalidInputError for non-string input', () => {
    expect(() => __tatakai_parse_html__(null as any)).toThrow();
    try { __tatakai_parse_html__(null as any); } catch (e: any) { expect(e.name).toBe('InvalidInputError'); }
  });
});
