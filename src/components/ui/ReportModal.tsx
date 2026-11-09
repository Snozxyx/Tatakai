import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { CaptchaWidget, type CaptchaWidgetHandle } from "@/components/security/CaptchaWidget";
import { isCaptchaRequired, requestSecurity } from "@/lib/security/captcha";
import { ugcErrorMessage } from "@/lib/ugcErrors";

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetType: 'comment' | 'anime' | 'server' | 'user' | 'post' | 'tierlist' | 'playlist' | 'direct_message';
    targetId: string;
    targetName?: string;
}

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName }: ReportModalProps) {
  useUiTranslation();
    const { user } = useAuth();
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const captchaRequired = isCaptchaRequired();
    const captchaRef = useRef<CaptchaWidgetHandle>(null);


    const handleSubmit = async () => {
        if (!user) {
            toast.error(uiI18n.t('app.you_must_be_logged_in_to_report_cc4ae7d0'));
            return;
        }

        if (!reason) {
            toast.error(uiI18n.t('app.please_select_a_reason_7ca6e0e6'));
            return;
        }

        if (captchaRequired && !captchaToken) {
            toast.error(uiI18n.t('app.please_complete_the_verification_challenge_7dbc0a97'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error(uiI18n.t('app.you_must_be_logged_in_to_report_cc4ae7d0'));
            await requestSecurity('submissions/report', { captchaToken: captchaToken ?? undefined, targetType, targetId, reason, details }, { accessToken: session.access_token });

            toast.success(uiI18n.t('app.report_submitted_successfully_our_moderators_wil_f78c23c3'));
            onClose();
            // Reset form
            setReason("");
            setDetails("");
            captchaRef.current?.reset();
            setCaptchaToken(null);
        } catch (error: any) {
            toast.error(ugcErrorMessage(error, "Failed to submit report: "));
            captchaRef.current?.reset();
            setCaptchaToken(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getReasons = () => {
        switch (targetType) {
            case 'direct_message':
            case 'comment':
            case 'post':
            case 'tierlist':
            case 'playlist':
                return ["Spam", "Harassment", "Spoiler", "Hate Speech", "NSFW", "Other"];
            case 'anime':
                return ["Wrong Title/Info", "Broken Metadata", "Missing Episodes", "Copyright Issue", "Other"];
            case 'server':
                return ["Video not loading", "Slow buffering", "Wrong video", "Subtitle issues", "Other"];
            case 'user':
                return ["Inappropriate profile", "Ban evasion", "Trolling", "Other"];
            default:
                return ["General issue", "Other"];
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>
                    <DialogTitle className="text-xl font-bold">{uiI18n.t('app.report_ee45c303')} {targetType}</DialogTitle>
                    <DialogDescription>
                        {uiI18n.t('app.reporting_6c8a7132')} <span className="text-foreground font-medium">{targetName || targetId}</span>. {user ? '' : uiI18n.t('app.please_sign_in_to_submit_a23f34d7')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.reason_f219cc06')}</label>
                        <Select onValueChange={setReason} value={reason}>
                            <SelectTrigger className="bg-white/5 border-white/10">
                                <SelectValue placeholder={uiI18n.t('app.select_a_reason_e58d562f')} />
                            </SelectTrigger>
                            <SelectContent>
                                {getReasons().map((r) => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">{uiI18n.t('app.additional_details_cc7b272d')}</label>
                        <Textarea
                            placeholder={uiI18n.t('app.please_provide_more_context_5e964256')}
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            className="bg-white/5 border-white/10 min-h-[100px] resize-none"
                        />
                    </div>

                    {isOpen && user && (
                        <CaptchaWidget
                            key={`${targetType}:${targetId}`}
                            ref={captchaRef}
                            action="report"
                            onToken={setCaptchaToken}
                            onExpire={() => setCaptchaToken(null)}
                            onError={() => setCaptchaToken(null)}
                            disabled={isSubmitting}
                        />
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        {uiI18n.t('app.cancel_77dfd213')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !user || (captchaRequired && !captchaToken)}
                        className="shadow-lg shadow-destructive/20"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {uiI18n.t('app.submit_report_1ca00033')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
