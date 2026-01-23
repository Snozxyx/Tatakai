import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Clock, Users, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface GlobalPopup {
  id: string;
  title: string;
  content: string;
  popup_type: 'info' | 'warning' | 'alert' | 'promotion' | 'maintenance';
  image_url?: string;
  action_url?: string;
  action_label?: string;
  priority: number;
  display_frequency: 'once' | 'daily' | 'session' | 'always';
  created_at: string;
}

interface GlobalPopupProps {
  className?: string;
}

export function GlobalPopup({ className }: GlobalPopupProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sessionId] = useState(() => sessionStorage.getItem('sessionId') || `session_${Date.now()}`);
  const [dismissedPopups, setDismissedPopups] = useState<Set<string>>(new Set());
  const [neverShowPopups, setNeverShowPopups] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Generate session ID if not exists
    if (!sessionStorage.getItem('sessionId')) {
      sessionStorage.setItem('sessionId', sessionId);
    }
  }, [sessionId]);

  // Fetch active popups
  const { data: activePopups = [], isLoading } = useQuery({
    queryKey: ['global-popups', user?.id, sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_popups')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', new Date().toISOString())
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)
        .order('priority', { ascending: false })
        .limit(5);

      if (error) throw error;

      // Filter popups based on user status and frequency
      const filteredPopups = data.filter(popup => {
        // Check if popup is for guests/logged-in users
        if (popup.show_for_guests && !user) return true;
        if (popup.show_for_logged_in && user) return true;
        
        return false;
      });

      // Check display frequency and user preferences
      const availablePopups = [];
      
      for (const popup of filteredPopups) {
        // Skip if user has never shown this popup
        if (neverShowPopups.has(popup.id)) continue;
        
        // Check if popup was dismissed
        if (dismissedPopups.has(popup.id)) continue;

        // Check frequency restrictions
        if (popup.display_frequency !== 'always') {
          const { data: viewData } = await supabase
            .from('popup_views')
            .select('id')
            .eq('popup_id', popup.id)
            .eq('user_id', user?.id || null)
            .eq('session_id', user ? null : sessionId);

          if (viewData && viewData.length > 0) {
            switch (popup.display_frequency) {
              case 'once':
                continue; // Skip if already viewed
              case 'daily': {
                const lastView = new Date(viewData[0].viewed_at);
                const today = new Date();
                if (lastView.toDateString() === today.toDateString()) {
                  continue; // Skip if viewed today
                }
                break;
              }
              case 'session':
                continue; // Skip if viewed in this session
              default:
                break;
            }
          }
        }

        availablePopups.push(popup);
      }

      return availablePopups as GlobalPopup[];
    },
    enabled: true,
    refetchInterval: 30000, // Check for new popups every 30 seconds
  });

  // Track popup view mutation
  const trackViewMutation = useMutation({
    mutationFn: async (popupId: string) => {
      const { error } = await supabase
        .from('popup_views')
        .insert({
          popup_id: popupId,
          user_id: user?.id || null,
          session_id: user ? null : sessionId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-popups'] });
    },
  });

  const handleDismiss = (popupId: string) => {
    setDismissedPopups(prev => new Set([...prev, popupId]));
  };

  const handleNeverShow = (popupId: string) => {
    setNeverShowPopups(prev => new Set([...prev, popupId]));
    setDismissedPopups(prev => new Set([...prev, popupId]));
  };

  const handleAction = (popup: GlobalPopup) => {
    // Track click for analytics
    trackViewMutation.mutate(popup.id);
    
    if (popup.action_url) {
      window.open(popup.action_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getPopupIcon = (type: GlobalPopup['popup_type']) => {
    const iconClass = "h-6 w-6";
    switch (type) {
      case 'info':
        return <div className={cn(iconClass, "bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>i</div>;
      case 'warning':
        return <div className={cn(iconClass, "bg-yellow-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>!</div>;
      case 'alert':
        return <div className={cn(iconClass, "bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>!</div>;
      case 'promotion':
        return <div className={cn(iconClass, "bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>★</div>;
      case 'maintenance':
        return <div className={cn(iconClass, "bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>🔧</div>;
      default:
        return <div className={cn(iconClass, "bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-bold")}>i</div>;
    }
  };

  const getPopupBorderColor = (type: GlobalPopup['popup_type']) => {
    switch (type) {
      case 'info':
        return 'border-l-blue-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'alert':
        return 'border-l-red-500';
      case 'promotion':
        return 'border-l-green-500';
      case 'maintenance':
        return 'border-l-purple-500';
      default:
        return 'border-l-gray-500';
    }
  };

  if (isLoading || activePopups.length === 0) {
    return null;
  }

  // Show highest priority popup
  const popup = activePopups[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -100 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={cn("fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-lg", className)}
      >
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className={cn(
            "flex items-start gap-4 p-4 rounded-lg border-l-4 bg-muted/50",
            getPopupBorderColor(popup.popup_type)
          )}>
            {/* Icon */}
            <div className="flex-shrink-0">
              {popup.image_url ? (
                <img 
                  src={popup.image_url} 
                  alt={popup.title}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                getPopupIcon(popup.popup_type)
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{popup.title}</h3>
                  <div 
                    className="text-sm text-muted-foreground prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: popup.content }}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 ml-4">
                  {popup.action_url && popup.action_label && (
                    <button
                      onClick={() => handleAction(popup)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
                    >
                      {popup.action_label}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleNeverShow(popup.id)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Never show this again"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                  
                  <button
                    onClick={() => handleDismiss(popup.id)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Footer with stats */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>Priority: {popup.priority}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>Frequency: {popup.display_frequency}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}