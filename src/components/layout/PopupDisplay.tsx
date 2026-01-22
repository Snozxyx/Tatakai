import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface Popup {
  id: string;
  title: string;
  content: string | null;
  popup_type: 'banner' | 'modal' | 'toast' | 'fullscreen';
  background_color: string;
  text_color: string;
  accent_color: string;
  image_url: string | null;
  action_text: string | null;
  action_url: string | null;
  dismiss_text: string;
  target_pages: string[];
  target_user_type: 'all' | 'guests' | 'logged_in' | 'premium';
  show_on_mobile: boolean;
  show_on_desktop: boolean;
  start_date: string | null;
  end_date: string | null;
  frequency: 'once' | 'always' | 'daily' | 'weekly';
  priority: number;
  is_active: boolean;
}

export function PopupDisplay() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [dismissedPopups, setDismissedPopups] = useState<Record<string, number>>({});

  // Load dismissed popups from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dismissed_popups');
    if (stored) {
      try {
        setDismissedPopups(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse dismissed popups', e);
      }
    }
  }, []);

  const { data: popups = [] } = useQuery({
    queryKey: ['active_popups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('popups')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw error;
      return (data || []) as Popup[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const shouldShowPopup = (popup: Popup): boolean => {
    // Check if dismissed
    const dismissedAt = dismissedPopups[popup.id];
    if (dismissedAt) {
      const now = Date.now();
      if (popup.frequency === 'once') return false;
      if (popup.frequency === 'always') {
        // For 'always' frequency, show again after 1 hour
        if (now - dismissedAt < 60 * 60 * 1000) return false;
      }
      if (popup.frequency === 'daily' && now - dismissedAt < 24 * 60 * 60 * 1000) return false;
      if (popup.frequency === 'weekly' && now - dismissedAt < 7 * 24 * 60 * 60 * 1000) return false;
    }

    // Check date range
    if (popup.start_date && new Date(popup.start_date) > new Date()) return false;
    if (popup.end_date && new Date(popup.end_date) < new Date()) return false;

    // Check device type
    const isMobile = window.innerWidth < 768;
    if (isMobile && !popup.show_on_mobile) return false;
    if (!isMobile && !popup.show_on_desktop) return false;

    // Check user type
    if (popup.target_user_type === 'guests' && user) return false;
    if (popup.target_user_type === 'logged_in' && !user) return false;
    if (popup.target_user_type === 'premium' && !profile?.is_premium) return false;

    // Check target pages
    if (popup.target_pages && popup.target_pages.length > 0) {
      const currentPath = location.pathname;
      const matches = popup.target_pages.some(page => {
        if (page === '/' && currentPath === '/') return true;
        if (page !== '/' && currentPath.startsWith(page)) return true;
        return false;
      });
      if (!matches) return false;
    }

    return true;
  };

  const handleDismiss = (popupId: string) => {
    const newDismissed = { ...dismissedPopups, [popupId]: Date.now() };
    setDismissedPopups(newDismissed);
    localStorage.setItem('dismissed_popups', JSON.stringify(newDismissed));
  };

  const handleAction = (popup: Popup) => {
    if (popup.action_url) {
      if (popup.action_url.startsWith('http')) {
        window.open(popup.action_url, '_blank');
      } else {
        window.location.href = popup.action_url;
      }
    }
    handleDismiss(popup.id);
  };

  const visiblePopups = popups.filter(shouldShowPopup);

  // Render different popup types
  const banners = visiblePopups.filter(p => p.popup_type === 'banner');
  const modals = visiblePopups.filter(p => p.popup_type === 'modal');
  const toasts = visiblePopups.filter(p => p.popup_type === 'toast');
  const fullscreens = visiblePopups.filter(p => p.popup_type === 'fullscreen');

  // Show toast popups
  useEffect(() => {
    toasts.forEach(popup => {
      if (!dismissedPopups[popup.id]) {
        toast(popup.title, {
          description: popup.content || undefined,
          action: popup.action_text && popup.action_url ? {
            label: popup.action_text,
            onClick: () => handleAction(popup),
          } : undefined,
          duration: 5000,
        });
        handleDismiss(popup.id);
      }
    });
  }, [toasts]);

  return (
    <>
      {/* Banners */}
      {banners.map(banner => (
        <div
          key={banner.id}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 shadow-lg"
          style={{
            backgroundColor: banner.background_color,
            color: banner.text_color,
          }}
        >
          <div className="flex-1 flex items-center gap-4">
            {banner.image_url && (
              <img src={banner.image_url} alt="" className="w-8 h-8 rounded" />
            )}
            <div>
              <p className="font-bold">{banner.title}</p>
              {banner.content && <p className="text-sm opacity-90">{banner.content}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {banner.action_text && banner.action_url && (
              <Button
                size="sm"
                onClick={() => handleAction(banner)}
                style={{ backgroundColor: banner.accent_color, color: banner.text_color }}
              >
                {banner.action_text}
              </Button>
            )}
            <button
              onClick={() => handleDismiss(banner.id)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {/* Modals */}
      {modals.map(modal => (
        <Dialog key={modal.id} open={true} onOpenChange={() => handleDismiss(modal.id)}>
          <DialogContent
            className="max-w-md"
            style={{
              backgroundColor: modal.background_color,
              color: modal.text_color,
            }}
          >
            {modal.image_url && (
              <img src={modal.image_url} alt="" className="w-full rounded-lg mb-4" />
            )}
            <h2 className="text-2xl font-bold mb-2">{modal.title}</h2>
            {modal.content && <p className="mb-4">{modal.content}</p>}
            <div className="flex gap-2">
              {modal.action_text && modal.action_url && (
                <Button
                  onClick={() => handleAction(modal)}
                  style={{ backgroundColor: modal.accent_color }}
                >
                  {modal.action_text}
                </Button>
              )}
              <Button variant="outline" onClick={() => handleDismiss(modal.id)}>
                {modal.dismiss_text}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ))}

      {/* Fullscreen */}
      {fullscreens.map(fullscreen => (
        <div
          key={fullscreen.id}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            backgroundColor: fullscreen.background_color,
            color: fullscreen.text_color,
          }}
        >
          <div className="max-w-2xl w-full text-center">
            {fullscreen.image_url && (
              <img src={fullscreen.image_url} alt="" className="w-full max-w-md mx-auto rounded-lg mb-6" />
            )}
            <h1 className="text-4xl font-bold mb-4">{fullscreen.title}</h1>
            {fullscreen.content && <p className="text-lg mb-8">{fullscreen.content}</p>}
            <div className="flex gap-4 justify-center">
              {fullscreen.action_text && fullscreen.action_url && (
                <Button
                  size="lg"
                  onClick={() => handleAction(fullscreen)}
                  style={{ backgroundColor: fullscreen.accent_color }}
                >
                  {fullscreen.action_text}
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => handleDismiss(fullscreen.id)}>
                {fullscreen.dismiss_text}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
