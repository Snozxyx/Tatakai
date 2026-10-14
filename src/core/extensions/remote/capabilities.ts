/** Static analysis only. Never evaluates provider code or constructs its class. */
export function providerCapabilityIssues(ts: any, code: string): string[] {
  const source = ts.createSourceFile('provider.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const host = { getSourceFile: (file: string) => file === 'provider.js' ? source : undefined,
    getDefaultLibFileName: () => '', writeFile: () => {}, getCurrentDirectory: () => '', getDirectories: () => [],
    fileExists: (file: string) => file === 'provider.js', readFile: () => code, getCanonicalFileName: (file: string) => file,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const checker = ts.createProgram(['provider.js'], { allowJs: true, noLib: true }, host).getTypeChecker();
  const missing = new Set<string>();
  const supported = new Set(['$getUserPreference', '$sleep', '$toString', '$toBytes', '$store']);
  const visit = (node: any) => {
    if (ts.isIdentifier(node) && (/^\$/.test(node.text) || node.text === 'CryptoJS') && !supported.has(node.text) && !checker.getSymbolAtLocation(node)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) missing.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const issues: string[] = [];
  if (missing.size) issues.push('Unsupported Seanime host bindings: ' + [...missing].join(', '));
  if (/\bChromeDP\s*\.\s*(?!newBrowser\b)[a-zA-Z_$]/.test(code) || /\bChromeDP\s*\(/.test(code)) issues.push('Unsupported ChromeDP API; Tatakai supports newBrowser on desktop');
  return issues;
}
