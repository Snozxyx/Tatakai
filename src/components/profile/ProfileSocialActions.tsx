import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfileCodePresentation } from '@/contexts/ProfileCodePresentationContext';
import { MessageButton } from '@/components/community/MessageButton';
import { Button } from '@/components/ui/button';
import './profile-social-actions.css';

/** Sits inside each theme's action layout, never in a separate page toolbar. */
export function ProfileSocialActions({ userId, className = '', onMessageOpened }: { userId?: string | null; className?: string; onMessageOpened?: () => void }) {
  const { user } = useAuth();
  const code = useProfileCodePresentation();
  if ((!userId || !user || user.id === userId) && !code.enabled) return null;
  return <div data-profile-protected className={`profile-social-actions ${className}`}>
    <MessageButton userId={userId} onOpened={onMessageOpened} />
    {code.enabled && <Button size="sm" variant="ghost" title={code.hidden ? 'Show custom styling' : 'Hide custom styling'} aria-label={code.hidden ? 'Show custom styling' : 'Hide custom styling'} onClick={code.toggle}>{code.hidden ? <Eye size={14} /> : <EyeOff size={14} />}<span className="sr-only">{code.hidden ? 'Show custom styling' : 'Hide custom styling'}</span></Button>}
  </div>;
}
