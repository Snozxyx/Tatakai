import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, X, ThumbsUp, ThumbsDown, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useSuggestions } from '@/hooks/useSuggestions';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SuggestionData {
  id: string;
  title: string;
  description: string;
  category: 'feature' | 'improvement' | 'content';
  priority: 'low' | 'medium' | 'high';
  image_url?: string;
  vote_count: number;
  status: 'pending' | 'reviewing' | 'approved';
}

interface DynamicSuggestionBannerProps {
  className?: string;
  context?: 'home' | 'recommendations' | 'anime' | 'player';
  maxPerSession?: number;
}

export function DynamicSuggestionBanner({ 
  className, 
  context = 'home',
  maxPerSession = 3 
}: DynamicSuggestionBannerProps) {
  const { user } = useAuth();
  const { data: popularSuggestions = [] } = useSuggestions();
  const [currentSuggestion, setCurrentSuggestion] = useState<SuggestionData | null>(null);
  const [sessionShownCount, setSessionShownCount] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Get session storage key
  const sessionKey = `suggestion_banner_${context}_${user?.id || 'guest'}`;
  const dismissedKey = `suggestion_banner_dismissed_${context}`;

  useEffect(() => {
    // Check if user has seen too many banners this session
    const shown = sessionStorage.getItem(sessionKey);
    if (shown) {
      setSessionShownCount(parseInt(shown) || 0);
    }

    // Check if banner was recently dismissed
    const dismissed = localStorage.getItem(dismissedKey);
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const now = Date.now();
      // Don't show if dismissed within last 24 hours
      if (now - dismissedTime < 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Show banner after a delay to not interrupt user immediately
    const timer = setTimeout(() => {
      selectAndShowSuggestion();
    }, 5000); // Show after 5 seconds

    return () => clearTimeout(timer);
  }, [context, user?.id]);

  const selectAndShowSuggestion = () => {
    if (!popularSuggestions.length || sessionShownCount >= maxPerSession) return;

    // Filter suggestions based on context
    const contextRelevantSuggestions = popularSuggestions.filter(suggestion => {
      switch (context) {
        case 'home':
          return suggestion.category === 'feature' || suggestion.priority === 'high';
        case 'recommendations':
          return suggestion.title.toLowerCase().includes('recommend') || 
                 suggestion.title.toLowerCase().includes('ai');
        case 'anime':
          return suggestion.category === 'content' || 
                 suggestion.title.toLowerCase().includes('anime');
        case 'player':
          return suggestion.title.toLowerCase().includes('player') || 
                 suggestion.title.toLowerCase().includes('video');
        default:
          return true;
      }
    });

    if (contextRelevantSuggestions.length === 0) return;

    // Select a random suggestion with higher priority for high-engagement suggestions
    const weightedSuggestions = contextRelevantSuggestions.flatMap(suggestion => {
      const weight = suggestion.priority === 'high' ? 3 : suggestion.priority === 'medium' ? 2 : 1;
      return Array(weight).fill(suggestion);
    });

    const randomIndex = Math.floor(Math.random() * weightedSuggestions.length);
    const selectedSuggestion = weightedSuggestions[randomIndex] as SuggestionData;
    
    setCurrentSuggestion(selectedSuggestion);
    setIsVisible(true);

    // Update session count
    const newCount = sessionShownCount + 1;
    setSessionShownCount(newCount);
    sessionStorage.setItem(sessionKey, newCount.toString());
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setHasInteracted(true);
    
    // Store dismissal for 24 hours
    localStorage.setItem(dismissedKey, Date.now().toString());
    
    // Track interaction
    trackSuggestionInteraction('dismissed');
  };

  const handleVote = async (type: 'up' | 'down') => {
    if (!currentSuggestion) return;
    
    try {
      await supabase
        .from('user_suggestion_votes')
        .upsert({
          user_id: user?.id,
          suggestion_id: currentSuggestion.id,
          vote_type: type,
        });

      trackSuggestionInteraction(`voted_${type}`);
      handleDismiss();
    } catch (error) {
      console.error('Failed to record vote:', error);
    }
  };

  const handleViewDetails = () => {
    if (!currentSuggestion) return;
    
    trackSuggestionInteraction('viewed_details');
    // Navigate to suggestions page
    window.open('/suggestions', '_blank');
    handleDismiss();
  };

  const trackSuggestionInteraction = async (action: string) => {
    try {
      await supabase
        .from('admin_analytics')
        .insert({
          metric_type: 'suggestion_banner_interaction',
          metric_value: 1,
          metadata: {
            action,
            context,
            suggestion_id: currentSuggestion?.id,
            session_count: sessionShownCount,
            user_id: user?.id,
          },
        });
    } catch (error) {
      console.error('Failed to track suggestion interaction:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'from-red-500/20 to-orange-500/20 border-red-500/30';
      case 'medium':
        return 'from-yellow-500/20 to-orange-500/20 border-yellow-500/30';
      default:
        return 'from-blue-500/20 to-purple-500/20 border-blue-500/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'feature':
        return <Sparkles className="w-4 h-4" />;
      case 'content':
        return <Lightbulb className="w-4 h-4" />;
      default:
        return <ThumbsUp className="w-4 h-4" />;
    }
  };

  if (!isVisible || !currentSuggestion || hasInteracted) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -50, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={cn("fixed top-4 left-4 right-4 z-50 mx-auto max-w-md", className)}
      >
        <Card className={cn(
          "bg-gradient-to-br backdrop-blur-xl border shadow-2xl",
          getPriorityColor(currentSuggestion.priority)
        )}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 rounded-lg bg-primary/20">
                {getCategoryIcon(currentSuggestion.category)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-sm line-clamp-2">
                    {currentSuggestion.title}
                  </h4>
                  <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 p-1 rounded hover:bg-muted/50 transition-colors"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {currentSuggestion.description}
                </p>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewDetails}
                    className="flex-1 text-xs h-8"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View Details
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleVote('up')}
                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/10"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleVote('down')}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="w-3 h-3" />
                    {currentSuggestion.vote_count} votes
                  </span>
                  <span className="capitalize">{currentSuggestion.priority} priority</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook to use dynamic suggestion banners in different contexts
export function useSuggestionBanner() {
  const { user } = useAuth();
  
  const getBannerConfig = (context: 'home' | 'recommendations' | 'anime' | 'player') => {
    // Determine if user is eligible for suggestion banners
    const isNewUser = user && !user.created_at ? false : true;
    const hasSeenBanners = sessionStorage.getItem(`suggestion_banner_${context}_${user?.id || 'guest'}`);
    
    return {
      enabled: isNewUser && !hasSeenBanners,
      context,
    };
  };

  return { getBannerConfig };
}