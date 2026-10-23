import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemedSelect } from '../src/components/ui/themed-select';

test('themed selects preserve empty values, grouped options and form fields', () => {
  const html = renderToStaticMarkup(<form><ThemedSelect name="language" aria-label="Audio language" value="" onChange={() => {}}>
    <option value="">All languages</option><optgroup label="Languages"><option value="ja">Japanese</option><option value="en" disabled>English</option></optgroup>
  </ThemedSelect></form>);
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-label="Audio language"');
  expect(html).toContain('All languages');
  expect(html).toContain('name="language"');
  expect(html).toContain('hidden');
  expect(html).toContain('bg-background');
});
