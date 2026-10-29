import { parse } from 'postcss';

export interface ProfileCustomCode {
  version: 1; enabled: boolean; html: string; css: string; placement: 'top' | 'bottom';
}
export const DEFAULT_PROFILE_CODE: ProfileCustomCode = { version: 1, enabled: false, html: '', css: '', placement: 'bottom' };
const properties = new Set(['color', 'background-color', 'border-color', 'border-width', 'border-style', 'border-radius',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'row-gap', 'column-gap',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform']);
/** Parse CSS, then rebuild only the supported appearance rules. Never inject raw CSS. */
export function compileProfileCss(input: string, scope?: string): { css: string; warnings: string[] } {
  const warnings = new Set<string>();
  if (input.length > 20000) return { css: '', warnings: ['CSS must be 20,000 characters or fewer.'] };
  try {
    const root = parse(input);
    root.walkAtRules(rule => { warnings.add(`@${rule.name} is not supported.`); rule.remove(); });
    root.walkRules(rule => {
      // A deliberately small selector grammar prevents escaping the generated scope.
      // Attribute selectors, functional selectors, nesting and CSS escapes are excluded.
      if (!/^[a-zA-Z0-9_.# >+~,:-]+$/.test(rule.selector) || rule.parent?.type !== 'root') {
        warnings.add('Use simple element, class, or ID selectors.'); rule.remove(); return;
      }
      const selectors = rule.selector.split(',').map(s => s.trim()).filter(Boolean);
      if (!selectors.length) { rule.remove(); return; }
      if (scope) rule.selector = selectors.map(s => `:where([data-profile-custom-root="${scope.replace(/[^a-zA-Z0-9-]/g, '')}"]) ${s}:not([data-profile-protected], [data-profile-protected] *)`).join(',');
      rule.walkDecls(decl => {
        if (!properties.has(decl.prop.toLowerCase()) || !/^[a-zA-Z0-9%#., ()+-]+$/.test(decl.value) || /url\s*\(|var\s*\(|expression|!|\\/i.test(decl.value)) {
          warnings.add(`${decl.prop} or its value is not supported.`); decl.remove(); return;
        }
        decl.important = false;
      });
    });
    root.walkComments(comment => { comment.remove(); });
    // Remove bare declarations or parser-tolerated fragments outside ordinary rules.
    root.nodes = root.nodes.filter(node => node.type === 'rule');
    return { css: root.toString(), warnings: [...warnings] };
  } catch { return { css: '', warnings: ['CSS could not be parsed. Check the braces and declarations.'] }; }
}
