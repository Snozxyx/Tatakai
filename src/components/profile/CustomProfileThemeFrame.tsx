import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { useChatDock } from '@/contexts/ChatDockContext';
import { useSocialPresence } from '@/hooks/community/useSocialActivity';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { randomUUID } from '@/lib/uuid';
import { compileCustomThemeCss, renderProfileTemplate, renderProfileTemplateCss, safeTemplateImage, safeTemplateLink, type CustomProfileTheme, type ProfileTemplateData } from '@/lib/profileTemplate';
import './custom-profile-theme.css';

function sanitizeThemeHtml(html: string) {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['main', 'header', 'nav', 'footer', 'section', 'article', 'aside', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'img', 'figure', 'figcaption', 'a', 'button', 'details', 'summary'],
    ALLOWED_ATTR: ['class', 'id', 'src', 'alt', 'width', 'height', 'href', 'target', 'rel', 'type', 'title', 'aria-label', 'data-profile-action'], ALLOW_DATA_ATTR: false });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('img').forEach(img => { const src = safeTemplateImage(img.getAttribute('src')); if (!src) img.remove(); else { img.setAttribute('src', src); img.setAttribute('referrerpolicy', 'no-referrer'); img.setAttribute('loading', 'lazy'); } });
  doc.querySelectorAll('a').forEach(link => { const href = safeTemplateLink(link.getAttribute('href')); if (!href) link.removeAttribute('href'); else link.setAttribute('href', href); if (href.startsWith('https:')) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); } });
  return doc.body.innerHTML;
}

/** Only our nonce-authorized bridge runs. Author scripts and parent access stay blocked. */
export function CustomProfileThemeFrame({ code, data, followingCount = 0, preview = false, onOriginal, onMessageOpened, onBack, compact = false }: { code: CustomProfileTheme; data: ProfileTemplateData; followingCount?: number; preview?: boolean; onOriginal?: () => void; onMessageOpened?: () => void; onBack?: () => void; compact?: boolean }) {
  const { user } = useAuth();
  const { openSettings } = useSettingsModal();
  const { openChat } = useChatDock();
  const navigate = useNavigate();
  const reducedMotion = useMotionPreference();
  const { data: presence } = useSocialPresence([data.owner.user_id]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(randomUUID);
  const [height, setHeight] = useState(() => typeof window === 'undefined' ? 800 : Math.max(500, window.innerHeight));
  const doc = useMemo(() => {
    const rendered = renderProfileTemplate(code.html, data, presence?.[0], followingCount);
    const css = compileCustomThemeCss(renderProfileTemplateCss(code.css, data), reducedMotion).css.replace(/</g, '\\3c ');
    const bridge = `const token=${JSON.stringify(nonce)};const send=(value)=>parent.postMessage({channel:'tatakai-profile-theme',token,...value},'*');document.addEventListener('click',event=>{const target=event.target.closest('button[data-profile-action],a[href]');if(!target)return;if(target.tagName==='A'){const href=target.getAttribute('href');if(href&&href.startsWith('/')&&!href.startsWith('//')){event.preventDefault();send({action:'navigate',href});}}else{event.preventDefault();send({action:target.getAttribute('data-profile-action')});}});const measure=()=>send({action:'resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)});new ResizeObserver(measure).observe(document.body);window.addEventListener('load',measure);measure();`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src https: ${window.location.origin}; base-uri 'none'; form-action 'none'; connect-src 'none'"><style>html{color-scheme:dark}body{margin:0;overflow-wrap:anywhere}img{max-width:100%}button,a{touch-action:manipulation}${css}</style></head><body>${sanitizeThemeHtml(rendered.html)}<script nonce="${nonce}">${bridge}</script></body></html>`;
  }, [code.html, code.css, data, presence, followingCount, nonce, reducedMotion]);
  useEffect(() => {
    let disposed = false;
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'tatakai-profile-theme' || event.data?.token !== nonce) return;
      const { action } = event.data;
      if (action === 'resize') { if (!preview && !compact && Number.isFinite(event.data.height)) setHeight(Math.max(window.innerHeight, 500, Math.min(30000, event.data.height))); return; }
      if (preview) return;
      if (action === 'back') { if (onBack) onBack(); else navigate(-1); return; }
      if (action === 'default') { onOriginal?.(); return; }
      if (action === 'edit' && data.isOwner) { openSettings('profile-store', 'html-css'); return; }
      if (action === 'navigate') { const path = safeTemplateLink(event.data.href); if (path.startsWith('/')) navigate(path); return; }
      if (action === 'follow' || action === 'message') {
        if (!user) { navigate('/auth'); return; }
        if (data.isOwner) return;
        if (action === 'follow') data.onFollow();
        else {
          const { data: id, error } = await supabase.rpc('start_direct_conversation' as never, { p_recipient: data.owner.user_id } as never);
          if (disposed) return;
          if (error) toast.error('Messaging is unavailable. Please try again.'); else { openChat(id as string); onMessageOpened?.(); }
        }
      }
    };
    window.addEventListener('message', receive);
    const fit = () => { if (!preview && !compact) setHeight(Math.max(500, window.innerHeight)); };
    window.addEventListener('resize', fit);
    return () => { disposed = true; window.removeEventListener('message', receive); window.removeEventListener('resize', fit); };
  }, [data, user, preview, compact, nonce, openSettings, openChat, navigate, onOriginal, onMessageOpened, onBack]);
  return <iframe ref={frame} title={preview ? 'Custom profile theme preview' : `${code.theme_name} profile theme`} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={doc} className="custom-profile-theme-frame" style={{ height: compact ? 430 : preview ? 620 : height, width: '100%', border: 0, display: 'block' }} />;
}
