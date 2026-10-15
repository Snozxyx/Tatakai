import fs from 'node:fs';
import ts from 'typescript';

function flatten(object, prefix = '', result = {}) {
  for (const [name, value] of Object.entries(object)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') flatten(value, key, result);
    else result[key] = value;
  }
  return result;
}
const catalogs = Object.fromEntries(
  ['en', 'es', 'ja'].map((lang) => [
    lang,
    flatten(JSON.parse(fs.readFileSync(`src/locales/${lang}.json`))),
  ])
);
const errors = [];
const placeholders = (text) =>
  [...text.matchAll(/\{\{\s*-?\s*([^},]+)(?:,[^}]+)?\s*\}\}/g)]
    .map((m) => m[1].trim())
    .sort()
    .join(',');
for (const [lang, catalog] of Object.entries(catalogs)) {
  for (const key of new Set([
    ...Object.keys(catalogs.en),
    ...Object.keys(catalog),
  ])) {
    if (typeof catalog[key] !== 'string' || !catalog[key].trim())
      errors.push(`${lang}: missing or empty ${key}`);
    else if (
      catalogs.en[key] &&
      placeholders(catalogs.en[key]) !== placeholders(catalog[key])
    )
      errors.push(`${lang}: interpolation mismatch ${key}`);
  }
}
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : /\.tsx?$/.test(entry.name)
        ? [`${dir}/${entry.name}`]
        : []
    );
}
let references = 0;
for (const file of walk('src')) {
  const source = fs.readFileSync(file, 'utf8');
  if (/^(?:<<<<<<<|=======|>>>>>>>) /m.test(source))
    errors.push(`${file}: conflict marker`);
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  for (const diagnostic of ast.parseDiagnostics)
    errors.push(
      `${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
    );
  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(ast) === 'i18nKey' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      !catalogs.en[node.initializer.text]
    )
      errors.push(
        `${file}: missing rich-text translation ${node.initializer.text}`
      );
    if (
      ts.isCallExpression(node) &&
      /^(?:t|(?:uiI18n|i18n)\.t)$/.test(node.expression.getText(ast)) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const key = node.arguments[0].text;
      references++;
      if (!catalogs.en[key]) errors.push(`${file}: missing translation ${key}`);
    }
    // Translation calls must never replace classes, DOM IDs, URLs, or form values.
    if (
      ts.isJsxAttribute(node) &&
      /^(?:className|id|href|src|value|name|type|key|style|data-.*)$/.test(
        node.name.getText(ast)
      )
    ) {
      const check = (n) => {
        if (
          ts.isJsxElement(n) ||
          ts.isJsxFragment(n) ||
          ts.isJsxSelfClosingElement(n)
        )
          return;
        if (ts.isCallExpression(n) && n.expression.getText(ast) === 'uiI18n.t')
          errors.push(
            `${file}: translated technical attribute ${node.name.getText(ast)}`
          );
        ts.forEachChild(n, check);
      };
      if (node.initializer) check(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `i18n: ${
      Object.keys(catalogs.en).length
    } keys per locale; ${references} literal references; interpolation and source checks passed.`
  );
