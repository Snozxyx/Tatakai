import { useAuth } from '@/contexts/AuthContext';
import { InboxButton } from '@/components/community/InboxButton';
import { NotificationBell } from '@/components/ui/NotificationBell';
import './header-social-actions.css';
export function HeaderSocialActions() {
  const {user}=useAuth();
  if(!user)return null;
  return <div className="header-social-actions" role="group" aria-label="Messages and notifications"><InboxButton /><span className="header-social-divider" aria-hidden="true" /><NotificationBell /></div>;
}
