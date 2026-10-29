import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code2, Eye, Monitor, RotateCcw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import { supabase } from '@/integrations/supabase/client';
import { FullPageProfileSurface } from '@/contexts/ProfilePresentationContext';
import { ProfileCodePresentationContext } from '@/contexts/ProfileCodePresentationContext';
import { useCustomProfileTheme, useCustomThemePreviewData } from '@/hooks/user/useCustomProfileTheme';
import { compileCustomThemeCss, DEFAULT_CUSTOM_THEME, PROFILE_TEMPLATE_TAGS, renderProfileTemplate, renderProfileTemplateCss, type CustomProfileTheme } from '@/lib/profileTemplate';
import { CustomProfileThemeFrame } from '@/components/profile/CustomProfileThemeFrame';
import type { ProfileThemeData } from '@/components/profile/themes/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import './custom-profile-theme.css';

/** Custom HTML/CSS replaces the complete profile. Built-in themes remain available as a fallback. */
export function ProfileCustomSurface({ userId, data, followingCount = 0, children }: { userId?: string | null; data?: ProfileThemeData; followingCount?: number; children: ReactNode }) {
  const { user } = useAuth();
  const query = useCustomProfileTheme(userId);
  const [hidden, setHidden] = useState(false);
  const { openSettings } = useSettingsModal();
  useEffect(() => setHidden(false), [userId]);
  const code = query.data;
  const active = code?.enabled && !hidden && !!code.html.trim() && !!data;
  return <ProfileCodePresentationContext.Provider value={{ enabled: code?.enabled === true, hidden, toggle: () => setHidden(value => !value) }}>
    {active ? <FullPageProfileSurface><div className="custom-profile-theme-page"><CustomProfileThemeFrame key={userId} code={code} data={data} followingCount={followingCount} onOriginal={() => setHidden(true)} />
      <div className="custom-theme-recovery" aria-label="Profile view controls"><Button size="sm" variant="outline" onClick={() => setHidden(true)}><Eye size={14} />Original profile</Button>{user?.id === userId && <Button size="icon" variant="outline" aria-label="Edit custom theme" onClick={() => openSettings('profile-store', 'html-css')}><Code2 size={15} /></Button>}</div>
    </div></FullPageProfileSurface> : <div data-profile-custom-root={userId || 'preview'}>{children}</div>}
  </ProfileCodePresentationContext.Provider>;
}

export function ProfileCodeEditor() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const query = useCustomProfileTheme(user?.id);
  const preview = useCustomThemePreviewData();
  const [draft, setDraft] = useState<CustomProfileTheme>(DEFAULT_CUSTOM_THEME);
  const [mobile, setMobile] = useState(false);
  const [source, setSource] = useState<'html' | 'css'>('html');
  const [group, setGroup] = useState('Identity');
  const dirty = useRef(false);
  const htmlInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (query.data && !dirty.current) setDraft(query.data); }, [query.data]);
  const update = (patch: Partial<CustomProfileTheme>) => { dirty.current = true; setDraft(previous => ({ ...previous, ...patch })); };
  const compiled = useMemo(() => compileCustomThemeCss(renderProfileTemplateCss(draft.css, preview.data)), [draft.css, preview.data]);
  const unknown = useMemo(() => renderProfileTemplate(draft.html, preview.data).unknown, [draft.html, preview.data]);
  const warnings = [...compiled.warnings, ...unknown.map(tag => `Unknown tag: ${tag}`)];
  const save = useMutation({ mutationFn: async () => {
    if (!user) throw new Error('Sign in to create a theme.');
    if (!draft.theme_name.trim()) throw new Error('Give your theme a name.');
    if (!draft.html.trim()) throw new Error('Add HTML for your profile layout.');
    const { error } = await supabase.rpc('save_profile_custom_theme' as never, { p_name: draft.theme_name, p_html: draft.html, p_css: draft.css, p_enabled: draft.enabled } as never);
    if (error) throw new Error(error.message || 'Could not save your theme.');
  }, onSuccess: () => { dirty.current = false; void cache.invalidateQueries({ queryKey: ['profile-custom-code'] }); toast.success(draft.enabled ? 'Your custom profile theme is live.' : 'Theme draft saved.'); }, onError: error => toast.error(error.message) });
  const insertTag = (key: string) => {
    const tag = `{${key}}`, node = htmlInput.current;
    const start = source === 'html' ? node?.selectionStart ?? draft.html.length : draft.html.length;
    const end = source === 'html' ? node?.selectionEnd ?? start : start;
    update({ html: draft.html.slice(0, start) + tag + draft.html.slice(end) }); setSource('html');
    requestAnimationFrame(() => { htmlInput.current?.focus(); htmlInput.current?.setSelectionRange(start + tag.length, start + tag.length); });
  };
  if (!user) return <p className="text-sm text-muted-foreground">Sign in to create your own profile theme.</p>;
  return <div className="custom-theme-editor">
    <header className="custom-theme-editor-heading"><div><h2>Create your profile theme</h2><p>Build the whole layout with HTML and CSS. Add tags to bring your profile into it.</p></div><span className="custom-theme-free">Free for everyone</span></header>
    {query.isError && <div className="custom-theme-notice" role="status">The saved theme couldn’t load. The latest custom-theme database update may be needed. <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>Retry</Button></div>}
    <div className="custom-theme-setup"><div><Label htmlFor="custom-theme-name">Theme name</Label><Input id="custom-theme-name" maxLength={60} value={draft.theme_name} onChange={event => update({ theme_name: event.target.value })} disabled={save.isPending} /></div><div className="custom-theme-enable"><div><Label htmlFor="custom-theme-enabled">Use this theme</Label><p>Replace your profile’s current design after saving.</p></div><Switch id="custom-theme-enabled" checked={draft.enabled} disabled={save.isPending} onCheckedChange={enabled => update({ enabled })} /></div></div>
    <div className="custom-theme-workspace"><div className="custom-theme-code-pane">
      <div className="custom-theme-source-tabs" role="tablist" aria-label="Theme source" onKeyDown={event => { if ((event.target as HTMLElement).getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 'html' : event.key === 'End' ? 'css' : source === 'html' ? 'css' : 'html'; setSource(next); document.getElementById(`theme-${next}-tab`)?.focus(); }}><button type="button" role="tab" id="theme-html-tab" aria-controls="theme-html-panel" aria-selected={source === 'html'} tabIndex={source === 'html' ? 0 : -1} onClick={() => setSource('html')}>HTML</button><button type="button" role="tab" id="theme-css-tab" aria-controls="theme-css-panel" aria-selected={source === 'css'} tabIndex={source === 'css' ? 0 : -1} onClick={() => setSource('css')}>CSS</button><Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => update({ html: DEFAULT_CUSTOM_THEME.html, css: DEFAULT_CUSTOM_THEME.css })}><RotateCcw size={13} />Load starter</Button></div>
      <div id="theme-html-panel" role="tabpanel" aria-labelledby="theme-html-tab" hidden={source !== 'html'}><Label htmlFor="profile-html" className="sr-only">Profile HTML</Label><Textarea ref={htmlInput} id="profile-html" value={draft.html} maxLength={20000} spellCheck={false} className="custom-theme-source" disabled={save.isPending} onChange={event => update({ html: event.target.value })} /><p className="custom-theme-source-count">{draft.html.length.toLocaleString()} / 20,000 characters</p></div>
      <div id="theme-css-panel" role="tabpanel" aria-labelledby="theme-css-tab" hidden={source !== 'css'}><Label htmlFor="profile-css" className="sr-only">Profile CSS</Label><Textarea id="profile-css" value={draft.css} maxLength={20000} spellCheck={false} className="custom-theme-source" disabled={save.isPending} onChange={event => update({ css: event.target.value })} /><p className="custom-theme-source-count">{draft.css.length.toLocaleString()} / 20,000 characters</p></div>
      <section className="custom-theme-tag-guide"><h3>Bring in your data</h3><p>Click a tag to insert it into HTML. Use image tags in an image source, like <code>{'<img src="{avatar}" alt="{name}">'}</code>.</p><div className="custom-theme-tag-groups" aria-label="Tag categories">{['Identity', 'Stats', 'Collections', 'Actions'].map(value => <button key={value} type="button" aria-pressed={group === value} onClick={() => setGroup(value)}>{value}</button>)}</div><div className="custom-theme-tag-list">{PROFILE_TEMPLATE_TAGS.filter(tag => tag.group === group).map(tag => <button key={tag.key} type="button" title={tag.description} onClick={() => insertTag(tag.key)}><code>{`{${tag.key}}`}</code><span>{tag.description}</span></button>)}</div></section>
    </div><div className="custom-theme-preview-pane"><div className="custom-theme-preview-heading"><div><h3>Live preview</h3><p>{preview.isLoading ? 'Loading your profile data…' : preview.isError ? 'Some profile data could not load.' : 'Populated with your profile data'}</p></div><div className="custom-theme-device-switch"><Button size="icon" variant={mobile ? 'ghost' : 'secondary'} aria-label="Desktop preview" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={15} /></Button><Button size="icon" variant={mobile ? 'secondary' : 'ghost'} aria-label="Mobile preview" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={15} /></Button></div></div><div className="custom-theme-preview-window" data-mobile={mobile}><CustomProfileThemeFrame code={draft} data={preview.data} followingCount={preview.followingCount} preview /></div><p className="custom-theme-preview-note">Only data visible on your profile reaches the theme. Layout, colors, grids, responsive CSS, and animations are yours; scripts and remote fonts are blocked. Preview buttons don’t perform actions.</p></div></div>
    {warnings.length > 0 && <ul className="custom-theme-warnings" aria-label="Theme warnings">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
    <footer className="custom-theme-editor-footer"><p>Equipping a built-in theme switches this one off. Your code stays saved.</p><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : draft.enabled ? 'Save & use theme' : 'Save theme draft'}</Button></footer>
  </div>;
}
