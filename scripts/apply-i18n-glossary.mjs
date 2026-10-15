import fs from 'node:fs';

const glossary = JSON.parse(
  fs.readFileSync(new URL('./i18n-glossary.json', import.meta.url))
);
const root = new URL('../src/locales/', import.meta.url);
const catalogs = Object.fromEntries(
  ['en', 'es', 'ja'].map((lang) => [
    lang,
    JSON.parse(fs.readFileSync(new URL(`${lang}.json`, root))),
  ])
);
function visit(english, spanish, japanese) {
  for (const [key, value] of Object.entries(english)) {
    if (value && typeof value === 'object')
      visit(value, spanish[key], japanese[key]);
    else if (glossary[value]) [spanish[key], japanese[key]] = glossary[value];
  }
}
visit(catalogs.en, catalogs.es, catalogs.ja);
for (const [lang, catalog] of Object.entries(catalogs))
  fs.writeFileSync(
    new URL(`${lang}.json`, root),
    JSON.stringify(catalog, null, 2) + '\n'
  );
