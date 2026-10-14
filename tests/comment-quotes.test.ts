import { expect, test } from 'bun:test';
import { appendCommentQuote, splitCommentBlocks } from '../src/lib/commentQuotes';
import { sanitizeComment } from '../src/lib/sanitize';

test('selection quotes preserve multiline text and existing comment drafts', () => {
  const content = appendCommentQuote('My unfinished comment', 'First paragraph.\n\nSecond paragraph.');
  expect(content).toBe('My unfinished comment\n\n> First paragraph.\n> \n> Second paragraph.\n\n');
  expect(splitCommentBlocks(content)).toEqual([
    { quote: false, text: 'My unfinished comment\n' },
    { quote: true, text: 'First paragraph.\n\nSecond paragraph.' },
    { quote: false, text: '\n' },
  ]);
});
test('quoted markup stays plain text and empty selections leave drafts unchanged', () => {
  const quote = '**not bold** <script>alert(1)</script> @someone';
  expect(splitCommentBlocks(appendCommentQuote('', quote))[0]).toEqual({quote:true,text:quote});
  expect(appendCommentQuote('draft', '  ')).toBe('draft');
});
test('selection size is bounded while normal comments keep their line breaks', () => {
  expect(splitCommentBlocks(appendCommentQuote('', 'x'.repeat(2500)))[0].text.length).toBe(2000);
  expect(splitCommentBlocks('Hello\nworld')).toEqual([{quote:false,text:'Hello\nworld'}]);
});
test('quotes survive the existing HTML sanitizer without interpreting escaped markup', () => {
  expect(splitCommentBlocks('&gt; A &amp; B &lt;script&gt;\n\nMy comment')[0]).toEqual({quote:true,text:'A & B <script>'});
  const text = 'A & B <script>alert(1)</script> &lt;literal&gt;';
  expect(splitCommentBlocks(sanitizeComment(appendCommentQuote('', text)))[0].text).toBe(text);
});
