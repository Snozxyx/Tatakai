import { forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer, BubbleMenu, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { mergeAttributes, Mark } from '@tiptap/core';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { Bold, Italic, Heading2, Quote, Code as CodeIcon, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * RichEditor — a tiptap WYSIWYG shared by the post composer and comment reply
 * boxes. Emits sanitizable HTML (see RichContent) with `@` mentions carrying a
 * user_id and `#` hashtags, plus a selection BubbleMenu for inline formatting.
 */

interface SuggItem {
  id: string;
  label: string;
  userId?: string;
  display?: string;
  avatar?: string | null;
  hint?: string;
  isNew?: boolean;
}

// ── Suggestion dropdown ─────────────────────────────────────────────────────
const SuggestionList = forwardRef<
  { onKeyDown: (p: SuggestionKeyDownProps) => boolean },
  { items: SuggItem[]; command: (item: SuggItem) => void }
>(({ items, command }, ref) => {
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') { setSel((s) => (s + items.length - 1) % items.length); return true; }
      if (event.key === 'ArrowDown') { setSel((s) => (s + 1) % items.length); return true; }
      if (event.key === 'Enter') { if (items[sel]) command(items[sel]); return true; }
      return false;
    },
  }));
  if (!items.length) return null;
  return (
    <div className="min-w-[220px] max-w-[320px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#08090b]/95 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseEnter={() => setSel(i)}
          onMouseDown={(e) => { e.preventDefault(); command(item); }}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
            i === sel ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
          )}
        >
          {item.userId !== undefined && (
            item.avatar
              ? <img src={item.avatar} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" />
              : <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">{item.label[0]?.toUpperCase()}</span>
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{item.isNew ? `Create #${item.label}` : (item.display || `#${item.label}`)}</span>
            {item.hint && <span className="ml-1.5 text-xs text-muted-foreground">{item.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
});
SuggestionList.displayName = 'SuggestionList';

// ── Async item sources ──────────────────────────────────────────────────────
async function fetchUsers(query: string): Promise<SuggItem[]> {
  if (!query) return [];
  try {
    const { data } = await (supabase as any)
      .from('profiles')
      .select('user_id, username, display_name, avatar_url')
      .ilike('username', `${query}%`)
      .not('username', 'is', null)
      .limit(6);
    return (data || []).map((p: any) => ({
      id: p.user_id,
      userId: p.user_id,
      label: p.username,
      display: p.display_name || p.username,
      hint: `@${p.username}`,
      avatar: p.avatar_url || null,
    }));
  } catch {
    return [];
  }
}

async function fetchTags(query: string): Promise<SuggItem[]> {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const items: SuggItem[] = [];
  const seen = new Set<string>();
  try {
    const { data } = await (supabase as any)
      .from('post_hashtags')
      .select('tag')
      .ilike('tag', `${q}%`)
      .limit(20);
    for (const r of data || []) {
      const t = String(r.tag).toLowerCase();
      if (!seen.has(t)) { seen.add(t); items.push({ id: t, label: t }); }
    }
  } catch {
    /* pre-migration or empty */
  }
  if (q && !seen.has(q)) items.unshift({ id: q, label: q, isNew: true });
  return items.slice(0, 6);
}

// ── Suggestion popup lifecycle (portal + fixed positioning, no tippy dep) ────
function makeRender() {
  return () => {
    let component: ReactRenderer | null = null;
    let wrapper: HTMLDivElement | null = null;
    const place = (rect?: DOMRect | null) => {
      if (!wrapper || !rect) return;
      const h = wrapper.offsetHeight || 0;
      let top = rect.bottom + 6;
      if (top + h > window.innerHeight) top = rect.top - h - 6;
      wrapper.style.top = `${Math.max(8, top)}px`;
      wrapper.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
    };
    return {
      onStart: (props: SuggestionProps) => {
        component = new ReactRenderer(SuggestionList, { props, editor: props.editor });
        wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.zIndex = '10000';
        wrapper.appendChild(component.element);
        document.body.appendChild(wrapper);
        place(props.clientRect?.());
      },
      onUpdate: (props: SuggestionProps) => {
        component?.updateProps(props);
        place(props.clientRect?.());
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') return true;
        return (component?.ref as any)?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        wrapper?.remove();
        component?.destroy();
        component = null;
        wrapper = null;
      },
    };
  };
}

// ── Mention node types ──────────────────────────────────────────────────────
const MentionUser = Mention.extend({
  name: 'mentionUser',
  addAttributes() {
    return {
      userId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-user-id'),
        renderHTML: (a) => (a.userId ? { 'data-user-id': a.userId } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label') || (el.textContent || '').replace(/^@/, ''),
        renderHTML: (a) => (a.label ? { 'data-label': a.label } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-mention]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-mention': '', class: 'text-primary font-semibold' }, HTMLAttributes), `@${node.attrs.label}`];
  },
  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
}).configure({
  // Distinct PluginKey per Mention extension. Both @tiptap/extension-mention
  // instances default to the shared `mention$` key; without unique keys the two
  // ProseMirror suggestion plugins collide (the `#` one throws once `@` is
  // registered). See tiptap "multiple mention extensions".
  suggestion: { char: '@', pluginKey: new PluginKey('mentionUser'), items: ({ query }: { query: string }) => fetchUsers(query), render: makeRender() },
});

const MentionTag = Mention.extend({
  name: 'hashtag',
  addAttributes() {
    return {
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-tag') || (el.textContent || '').replace(/^#/, ''),
        renderHTML: (a) => (a.label ? { 'data-tag': a.label } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-hashtag]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-hashtag': '', class: 'text-primary font-semibold' }, HTMLAttributes), `#${node.attrs.label}`];
  },
  renderText({ node }) {
    return `#${node.attrs.label}`;
  },
}).configure({
  suggestion: { char: '#', pluginKey: new PluginKey('hashtag'), items: ({ query }: { query: string }) => fetchTags(query), render: makeRender() },
});

// ── Spoiler mark ────────────────────────────────────────────────────────────
// Inline mark emitting `span[data-spoiler]`; RichContent renders it as a
// click-to-reveal <SpoilerSpan>. Toggled via the BubbleMenu (toggleMark).
const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML() {
    return [{ tag: 'span[data-spoiler]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-spoiler': '', class: 'rounded bg-foreground/15 px-1' }, HTMLAttributes), 0];
  },
});

// ── Editor component ────────────────────────────────────────────────────────
export interface RichEditorHandle {
  getHTML: () => string;
  getText: () => string;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
  editor: Editor | null;
}

interface RichEditorProps {
  content?: string;
  placeholder?: string;
  editable?: boolean;
  autofocus?: boolean;
  className?: string;
  minHeight?: string;
  onChange?: (html: string) => void;
  onSubmit?: () => void;
  /** Called with pasted image files so the host can upload/attach them. */
  onPasteFiles?: (files: File[]) => void;
}

function ToolbarBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        active ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { content = '', placeholder = 'What’s happening?', editable = true, autofocus = false, className, minHeight = '80px', onChange, onSubmit, onPasteFiles },
  ref,
) {
  const editor = useEditor({
    editable,
    autofocus,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder }),
      MentionUser,
      MentionTag,
      Spoiler,
    ],
    content,
    editorProps: {
      attributes: {
        class: cn('tiptap prose prose-invert prose-sm max-w-none focus:outline-none', className),
        style: `min-height:${minHeight}`,
      },
      handleKeyDown: (_view, event) => {
        if (onSubmit && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (onPasteFiles && files && files.length) {
          const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
          if (images.length) { onPasteFiles(images); return true; }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? '',
    getText: () => editor?.getText() ?? '',
    clear: () => editor?.commands.clearContent(true),
    focus: () => editor?.commands.focus('end'),
    isEmpty: () => !editor || editor.isEmpty,
    editor: editor ?? null,
  }), [editor]);

  // Re-seed when the caller swaps `content` (e.g. opening the inline edit form).
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div className="rich-editor relative">
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-0.5 rounded-full border border-white/[0.08] bg-[#08090b]/95 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl"
        >
          <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><CodeIcon className="h-3.5 w-3.5" /></ToolbarBtn>
          <ToolbarBtn active={editor.isActive('spoiler')} onClick={() => editor.chain().focus().toggleMark('spoiler').run()}><EyeOff className="h-3.5 w-3.5" /></ToolbarBtn>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
});
