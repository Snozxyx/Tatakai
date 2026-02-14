import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from './GlassPanel';
import { Button } from './button';
import { Star, X, MessageSquare, Heart, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ReviewPopupProps {
    isOpen?: boolean;
    onClose?: () => void;
    animeId?: string;
    animeName?: string;
    userId?: string;
}

export function ReviewPopup({ isOpen: propIsOpen, onClose, animeId, animeName, userId }: ReviewPopupProps) {
    const { user: authUser } = useAuth();
    const user = userId ? { id: userId } : authUser;
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;

    // Use prop onClose if available, otherwise fallback to internal dismiss
    const handleClose = onClose || (() => {
        setInternalIsOpen(false);
        localStorage.setItem('tatakai_review_shown', 'true');
    });
    const [step, setStep] = useState<'invite' | 'rating' | 'feedback' | 'thanks'>('invite');
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // Show popup after 3 minutes if not shown before for logged in users
        const hasShown = localStorage.getItem('tatakai_review_shown');
        if (hasShown || propIsOpen !== undefined || !authUser) return;

        const timer = setTimeout(() => {
            setInternalIsOpen(true);
        }, 180000); // 3 minutes

        return () => clearTimeout(timer);
    }, [propIsOpen, authUser]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            if (user?.id) {
                await supabase.from('user_suggestions' as any).insert({
                    user_id: user.id,
                    title: 'App Review',
                    description: `Rating: ${rating}/5\n\n${feedback}`,
                    category: 'feedback',
                    priority: 'normal',
                    status: 'pending',
                    created_at: new Date().toISOString()
                });
            }
            setStep('thanks');
            localStorage.setItem('tatakai_review_shown', 'true');
            toast.success('Thank you for your feedback!');
        } catch (error) {
            toast.error('Failed to submit review');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => handleClose(), 3000);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    className="fixed bottom-6 right-6 z-[100] w-full max-w-sm"
                >
                    <GlassPanel className="p-6 shadow-2xl border-primary/20 bg-card/95 backdrop-blur-2xl">
                        <button
                            onClick={handleClose}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {step === 'invite' && (
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                                    <Heart className="w-6 h-6 text-primary fill-primary" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">Enjoying Tatakai?</h3>
                                    <p className="text-muted-foreground text-sm">Your feedback helps us build the best anime experience.</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => setStep('rating')} className="flex-1">Sure!</Button>
                                    <Button variant="ghost" onClick={handleClose}>Maybe later</Button>
                                </div>
                            </div>
                        )}

                        {step === 'rating' && (
                            <div className="space-y-6 text-center">
                                <h3 className="text-xl font-bold">Rate your experience</h3>
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <button
                                            key={s}
                                            onMouseEnter={() => setRating(s)}
                                            onClick={() => {
                                                setRating(s);
                                                setStep('feedback');
                                            }}
                                            className="transition-transform hover:scale-125"
                                        >
                                            <Star
                                                className={`w-8 h-8 ${s <= rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground'}`}
                                            />
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">Select a star to continue</p>
                            </div>
                        )}

                        {step === 'feedback' && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold">Anything else?</h3>
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder="Suggestions, bugs, or things you love..."
                                    className="w-full h-24 bg-muted/30 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="w-full"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                </Button>
                            </div>
                        )}

                        {step === 'thanks' && (
                            <div className="py-8 text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                                    <ThumbsUp className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-bold">Arigato!</h3>
                                <p className="text-muted-foreground text-sm">Your feedback has been received.</p>
                            </div>
                        )}
                    </GlassPanel>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
