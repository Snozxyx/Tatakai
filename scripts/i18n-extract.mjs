import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { decodeJsxEntities } from './i18n-text.mjs';

const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const output =
  process.argv.find((a) => a.startsWith('--output='))?.slice(9) ??
  (check ? null : 'i18n-inventory.json');
const roots = [
  'src/components',
  'src/pages',
  'src/hooks',
  'src/contexts',
  'src/routes',
  'src/lib',
  'src/core',
];
const files = roots.flatMap(function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(f) : /\.tsx?$/.test(f) ? [f] : [];
  });
});
const records = [];
const displayProps =
  /^(label|title|description|placeholder|alt|aria-label|aria-description|emptyMessage|emptyText|loadingText|errorMessage|message|subtitle|tooltip|text|heading|buttonText|confirmText|cancelText|fallback|emptyLabel|summary|caption|detail|body)$/;
function natural(value) {
  return (
    /[A-Za-z]{2}/.test(value) &&
    !/^(?:https?:|\/|data:|#[\da-f]{3,8}$)/i.test(value) &&
    !/^[\w.-]+@\w/.test(value) &&
    !/[{}<>]|\b(?:SELECT|FROM|query |mutation )\b/.test(value) &&
    !/^(?:[\w]+[.:/])+[\w./:-]+$/.test(value)
  );
}
function componentName(n) {
  if (!n?.parent) return '';
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name))
    return n.parent.name.text;
  if (
    ts.isCallExpression(n.parent) &&
    /^(?:React\.)?(?:memo|forwardRef)$/.test(n.parent.expression.getText()) &&
    ts.isVariableDeclaration(n.parent.parent)
  )
    return n.parent.parent.name.getText();
  return '';
}
function nearestFunction(n) {
  for (let p = n.parent; p; p = p.parent)
    if (ts.isFunctionLike(p) && p.body) return p;
}
function isComponent(n) {
  return /^(?:[A-Z]|use[A-Z])/.test(componentName(n));
}
for (const file of files) {
  if (/^src\/lib\/(?:i18n|uiI18n|localeFormat)\.ts$/.test(file)) continue;
  let source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const edits = [],
    components = new Set();
  function add(node, value, mode, args = []) {
    if (!natural(value)) return;
    const normalized = decodeJsxEntities(value).replace(/\s+/g, ' ').trim();
    const slug = normalized
      .toLowerCase()
      .replace(/\{\{.*?\}\}/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
    const hash = crypto
      .createHash('sha1')
      .update(normalized)
      .digest('hex')
      .slice(0, 8);
    const key = `app.${slug}_${hash}`;
    records.push({
      file,
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      key,
      text: normalized,
    });
    if (!write) return;
    const call = `uiI18n.t('${key}'${
      args.length
        ? `, { ${args.map((v, i) => `value${i}: ${v}`).join(', ')} }`
        : ''
    })`;
    let replacement = call;
    if (mode === 'jsx')
      replacement = node.getText(ast).replace(value, `{${call}}`);
    if (mode === 'attribute') replacement = `{${call}}`;
    if (mode === 'property') {
      const prop = node.parent;
      replacement = `get ${prop.name.getText(ast)}() { return ${call}; }`;
      edits.push([prop.getStart(ast), prop.end, replacement]);
    } else edits.push([node.getStart(ast), node.end, replacement]);
  }
  function visit(node) {
    if (
      ts.isFunctionLike(node) &&
      node.body &&
      ts.isBlock(node.body) &&
      isComponent(node)
    ) {
      // Subscribe independently so memoized views update without remounting playback or forms.
      components.add(node.body.getStart(ast) + 1);
    }
    if (ts.isJsxText(node)) {
      const raw = node.getText(ast),
        value = raw.trim();
      if (value) add(node, value, 'jsx');
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const p = node.parent;
      let eligible = false,
        mode = 'expression';
      if (ts.isJsxAttribute(p) && displayProps.test(p.name.getText(ast))) {
        eligible = true;
        mode = 'attribute';
      }
      if (
        ts.isPropertyAssignment(p) &&
        displayProps.test(p.name.getText(ast).replace(/['"]/g, ''))
      ) {
        eligible = true;
        mode = 'property';
      }
      if (ts.isJsxExpression(p) && p.expression === node)
        eligible =
          !ts.isJsxAttribute(p.parent) ||
          displayProps.test(p.parent.name.getText(ast));
      if (
        ts.isCallExpression(p) &&
        /^(?:(?:toast|sonner)\.(?:success|error|info|warning|message)|alert|confirm|prompt)$/.test(
          p.expression.getText(ast)
        )
      )
        eligible = true;
      if (ts.isNewExpression(p) && p.expression.getText(ast) === 'Error')
        eligible = true;
      if (
        ts.isVariableDeclaration(p) &&
        ts.isIdentifier(p.name) &&
        /(?:label|title|description|message|placeholder|text|heading|subtitle|tooltip|caption)$/i.test(
          p.name.text
        )
      )
        eligible = true;
      if (
        ts.isBindingElement(p) &&
        /(?:label|title|description|message|placeholder|text|heading|subtitle|tooltip|caption)$/i.test(
          p.name.getText(ast)
        )
      )
        eligible = true;
      if (
        ts.isCallExpression(p) &&
        /^set(?:Error|Message|StatusText|LoadingText|ErrorMessage|StatusMessage)$/.test(
          p.expression.getText(ast)
        )
      )
        eligible = true;
      if (
        ts.isReturnStatement(p) &&
        /(?:Label|Title|Description|Placeholder|Tooltip)$/.test(
          componentName(nearestFunction(node) ?? {})
        )
      )
        eligible = true;
      // Fallbacks and branches are UI only when an ancestor is visible JSX or a toast.
      if (ts.isConditionalExpression(p) || ts.isBinaryExpression(p)) {
        let q = p;
        while (
          q &&
          (ts.isConditionalExpression(q) ||
            ts.isBinaryExpression(q) ||
            ts.isParenthesizedExpression(q))
        )
          q = q.parent;
        if (q && ts.isJsxExpression(q)) {
          const attr = q.parent;
          eligible =
            !ts.isJsxAttribute(attr) ||
            displayProps.test(attr.name.getText(ast));
        }
        if (
          q &&
          ts.isCallExpression(q) &&
          /^toast\./.test(q.expression.getText(ast))
        )
          eligible = true;
        if (
          q &&
          ts.isVariableDeclaration(q) &&
          /(?:label|title|description|message|placeholder|text|heading|subtitle|tooltip|caption)$/i.test(
            q.name.getText(ast)
          )
        )
          eligible = true;
        if (
          q &&
          ts.isCallExpression(q) &&
          /^set(?:Error|Message|StatusText|LoadingText|ErrorMessage|StatusMessage)$/.test(
            q.expression.getText(ast)
          )
        )
          eligible = true;
        if (
          q &&
          ts.isReturnStatement(q) &&
          /(?:Label|Title|Description|Placeholder|Tooltip)$/.test(
            componentName(nearestFunction(node) ?? {})
          )
        )
          eligible = true;
        if (
          ts.isBinaryExpression(p) &&
          p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          p.right === node &&
          q &&
          ts.isJsxExpression(q)
        )
          eligible = true;
        // Never translate values used as conditions or machine comparisons.
        if (
          ts.isBinaryExpression(p) &&
          p.operatorToken.kind !== ts.SyntaxKind.BarBarToken &&
          p.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken &&
          p.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken
        )
          eligible = false;
        if (ts.isConditionalExpression(p) && p.condition === node)
          eligible = false;
      }
      if (eligible) {
        if (
          /^src\/(?:lib|core)\//.test(file) &&
          !(
            ts.isCallExpression(p) &&
            /^(?:toast|sonner)\./.test(p.expression.getText(ast))
          ) &&
          !ts.isJsxExpression(p) &&
          !ts.isJsxAttribute(p)
        )
          eligible = false;
      }
      if (eligible) {
        if (ts.isTemplateExpression(node)) {
          const args = node.templateSpans.map((s) => s.expression.getText(ast));
          const value =
            node.head.text +
            node.templateSpans
              .map((s, i) => `{{value${i}}}` + s.literal.text)
              .join('');
          // Interpolation braces are allowed for extracted templates.
          if (natural(value.replace(/\{\{value\d+\}\}/g, 'value'))) {
            const tempNatural = value;
            // add() validates natural text before accepting; placeholders are restored below.
            const safe = value.replace(/\{\{value(\d+)\}\}/g, 'I18N_VALUE_$1');
            add(node, safe, mode, args);
            const record = records.at(-1);
            if (
              record?.file === file &&
              record.line ===
                ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
            )
              record.text = tempNatural.replace(/\s+/g, ' ').trim();
          }
          return;
        }
        add(node, node.text, mode);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (write && edits.length) {
    for (const pos of components)
      if (!/^\s*useUiTranslation\(\);/.test(source.slice(pos)))
        edits.push([pos, pos, '\n  useUiTranslation();']);
    for (const [a, b, r] of edits.sort((a, b) => b[0] - a[0]))
      source = source.slice(0, a) + r + source.slice(b);
    if (!/import uiI18n from/.test(source))
      source = "import uiI18n from '@/lib/uiI18n';\n" + source;
    if (components.size && !/useTranslation as useUiTranslation/.test(source))
      source =
        "import { useTranslation as useUiTranslation } from 'react-i18next';\n" +
        source;
    for (let attempt = 0; ; attempt++) {
      try {
        fs.writeFileSync(file, source);
        break;
      } catch (e) {
        if (attempt === 5) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
  }
}
if (output) fs.writeFileSync(output, JSON.stringify(records, null, 2) + '\n');
console.log(
  JSON.stringify({
    occurrences: records.length,
    strings: new Set(records.map((r) => r.key)).size,
    files: new Set(records.map((r) => r.file)).size,
    output,
  })
);
if (check && records.length) process.exitCode = 1;
