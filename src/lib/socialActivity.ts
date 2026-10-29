export type SocialActivityKind = 'watching' | 'manga' | 'novel';
export interface SocialActivity {
  kind: SocialActivityKind;
  title: string;
  href: string;
  image?: string | null;
  detail?: string | null;
}
export interface SocialPrivacy {
  show_online: boolean;
  show_last_seen: boolean;
  share_watching: boolean;
  share_reading: boolean;
}
export const DEFAULT_SOCIAL_PRIVACY: SocialPrivacy = {
  show_online: true, show_last_seen: true, share_watching: true, share_reading: true,
};
export interface SocialPresence extends Partial<SocialActivity> {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  online: boolean;
  last_seen: string | null;
}
let current: SocialActivity | null = null;
export function getSocialActivity() { return current; }
export function publishSocialActivity(activity: SocialActivity | null) {
  current = activity;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tatakai:social-activity'));
}
export function safeActivityHref(href: unknown): string | null {
  return typeof href === 'string' && /^\/(anime|manga|novel)\/[a-zA-Z0-9_%.-]+$/.test(href) ? href : null;
}
export function activityPermitted(activity: SocialActivity | null, privacy: SocialPrivacy): boolean {
  return !!activity && privacy.show_online && (activity.kind === 'watching' ? privacy.share_watching : privacy.share_reading);
}
