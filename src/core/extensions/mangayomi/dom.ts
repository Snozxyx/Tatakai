// The worker entry is self-contained and does not import Node's optional canvas.
import { parseHTML } from 'linkedom/worker';

/** Detached documents only. No script execution, browser window or application DOM. */
export function createMangayomiDom() {
  const nodes = new Map<number, any>();
  let next = 0, parsedBytes = 0;
  const register = (node: any): number | null => {
    if (!node) return null;
    if (nodes.size >= 50000) throw Error('Source DOM node limit exceeded');
    const id = ++next; nodes.set(id, node); return id;
  };
  const list = (items: Iterable<any>) => Array.from(items, register);
  return (value: unknown) => {
    const request = value as { id: number | null; op: string; arg?: string };
    if (!request || typeof request.op !== 'string' || (request.arg !== undefined && typeof request.arg !== 'string')) throw Error('Invalid source DOM request');
    const arg = request.arg || '';
    if (request.op === 'parse') {
      parsedBytes += arg.length;
      if (arg.length > 2 * 1024 * 1024 || parsedBytes > 8 * 1024 * 1024) throw Error('Source HTML limit exceeded');
      return register(parseHTML(arg).document);
    }
    const node = nodes.get(request.id as number);
    if (!node) throw Error('Invalid source DOM handle');
    if (['select', 'selectFirst', 'tag', 'class', 'byId', 'attr', 'hasAttr'].includes(request.op) && arg.length > 4096) throw Error('Source selector is too long');
    switch (request.op) {
      case 'text': return node.textContent || node.documentElement?.textContent || '';
      case 'innerHtml': return node.innerHTML || '';
      case 'outerHtml': return node.outerHTML || node.toString();
      case 'localName': return node.localName || '';
      case 'namespaceUri': return node.namespaceURI || '';
      case 'attr': return node.getAttribute?.(arg) || '';
      case 'hasAttr': return node.hasAttribute?.(arg) || false;
      case 'select': return list(node.querySelectorAll(arg));
      case 'selectFirst': return register(node.querySelector(arg));
      case 'children': return list(node.children || []);
      case 'parent': return register(node.parentElement);
      case 'next': return register(node.nextElementSibling);
      case 'previous': return register(node.previousElementSibling);
      case 'tag': return list(node.getElementsByTagName(arg));
      case 'class': return list(node.getElementsByClassName(arg));
      case 'byId': return register(node.getElementById?.(arg) || Array.from(node.querySelectorAll('[id]')).find((element: any) => element.id === arg));
      default: throw Error('Unsupported source DOM operation');
    }
  };
}
