import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect, useCallback, useRef } from 'react';
import { reviewPromptDelay, markReviewPromptDismissed } from '@/lib/mobile/review-prompt';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPanel } from './GlassPanel';
import { Button } from './button';
import { Star, X, Heart, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CaptchaWidget, type CaptchaWidgetHandle } from '@/components/security/CaptchaWidget';
import { isCaptchaRequired, requestSecurity } from '@/lib/security/captcha';

interface ReviewPopupProps {
    isOpen?: boolean;
    onClose?: () => void;
    animeId?: string;
    animeName?: string;
    userId?: string;
}

export function ReviewPopup({ isOpen: propIsOpen, onClose, animeId, animeName }: ReviewPopupProps) {
  useUiTranslation();
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;

    // Use prop onClose if available, otherwise fallback to internal dismiss
    const handleClose = useCallback(() => {
        if (onClose) { onClose(); return; }
        setInternalIsOpen(false);
        markReviewPromptDismissed();
    }, [onClose]);
    const [step, setStep] = useState<'invite' | 'rating' | 'feedback' | 'thanks'>('invite');
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRequired = isCaptchaRequired();
    const captchaRef = useRef<CaptchaWidgetHandle>(null);

    useEffect(() => {
        if (propIsOpen !== undefined) return;
        const delay = reviewPromptDelay({
            getItem: key => localStorage.getItem(key),
            setItem: (key, value) => localStorage.setItem(key, value),
        });
        if (delay === null) return;
        const timer = setTimeout(() => setInternalIsOpen(true), delay);
        return () => clearTimeout(timer);
    }, [propIsOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]')) {
                event.preventDefault();
                handleClose();
            }
        };
        document.addEventListener('keydown', escape);
        return () => document.removeEventListener('keydown', escape);
    }, [isOpen, handleClose]);

    const handleSubmit = async () => {
        if (captchaRequired && !captchaToken) {
            toast.error(uiI18n.t('app.please_complete_the_verification_challenge_7dbc0a97'));
            return;
        }
        setIsSubmitting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            await requestSecurity('submissions/feedback', {
                captchaToken: captchaToken ?? undefined,
                animeId,
                animeName,
                rating,
                feedback,
            }, { accessToken: session?.access_token });

            setStep('thanks');
            markReviewPromptDismissed();
            toast.success(uiI18n.t('app.thank_you_for_your_feedback_71fa63b4'));
            setTimeout(() => handleClose(), 3000);
        } catch (error) {
            toast.error(uiI18n.t('app.failed_to_submit_review_dec0f44b'));
        } finally {
            captchaRef.current?.reset();
            setCaptchaToken(null);
            setIsSubmitting(false);
        }
    };

    return (
        createPortal(<AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    data-mobile-review
                    className="mobile-review-popup fixed bottom-6 right-6 z-[100] w-full max-w-sm"
                >
                    <GlassPanel className="p-6 shadow-2xl border-primary/20 bg-card/95 backdrop-blur-2xl">
                        <button
                            onClick={handleClose}
                            aria-label={uiI18n.t('common.close')}
                            className="absolute top-2 right-2 z-10 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {step === 'invite' && (
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                                    <Heart className="w-6 h-6 text-primary fill-primary" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold">{uiI18n.t('app.enjoying_tatakai_7de18a1e')}</h3>
                                    <p className="text-muted-foreground text-sm">{uiI18n.t('app.your_feedback_helps_us_build_the_best_anime_expe_5be1ad39')}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => setStep('rating')} className="flex-1">{uiI18n.t('app.sure_11354004')}</Button>
                                    <Button variant="ghost" onClick={handleClose}>{uiI18n.t('app.maybe_later_27ad1d83')}</Button>
                                </div>
                            </div>
                        )}

                        {step === 'rating' && (
                            <div className="space-y-6 text-center">
                                <h3 className="text-xl font-bold">{uiI18n.t('app.rate_your_experience_ac33ce37')}</h3>
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
                                <p className="text-xs text-muted-foreground">{uiI18n.t('app.select_a_star_to_continue_b89d478f')}</p>
                            </div>
                        )}

                        {step === 'feedback' && (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold">{uiI18n.t('app.anything_else_4689b412')}</h3>
                                <textarea
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    placeholder={uiI18n.t('app.suggestions_bugs_or_things_you_love_2d736d7c')}
                                    className="w-full h-24 bg-muted/30 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                                <CaptchaWidget ref={captchaRef} action="suggestion" onToken={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => setCaptchaToken(null)} disabled={isSubmitting} />
                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || (captchaRequired && !captchaToken)}
                                    className="w-full"
                                >
                                    {isSubmitting ? (uiI18n.language?.startsWith('es') ? 'Enviando...' : 'Submitting...') : uiI18n.t('app.submit_feedback_c5a35a73')}
                                </Button>
                            </div>
                        )}

                        {step === 'thanks' && (
                            <div className="py-8 text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                                    <ThumbsUp className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-bold">{uiI18n.t('app.arigato_ed120d15')}</h3>
                                <p className="text-muted-foreground text-sm">{uiI18n.t('app.your_feedback_has_been_received_5e1c5406')}</p>
                            </div>
                        )}
                    </GlassPanel>
                </motion.div>
            )}
        </AnimatePresence>, document.body)
    );
}
