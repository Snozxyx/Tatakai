import { useState } from "react";
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

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetType: 'comment' | 'anime' | 'server' | 'user';
    targetId: string;
    targetName?: string;
}

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName }: ReportModalProps) {
    const { user } = useAuth();
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!user) {
            toast.error("You must be logged in to report");
            return;
        }

        if (!reason) {
            toast.error("Please select a reason");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('reports').insert({
                reporter_id: user.id,
                target_type: targetType,
                target_id: targetId,
                reason,
                details,
                status: 'pending'
            });

            if (error) throw error;

            toast.success("Report submitted successfully. Our moderators will review it soon.");
            onClose();
            // Reset form
            setReason("");
            setDetails("");
        } catch (error: any) {
            toast.error("Failed to submit report: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getReasons = () => {
        switch (targetType) {
            case 'comment':
                return ["Spam", "Harassment", "Spoiler", "Hate Speech", "Other"];
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
                    <DialogTitle className="text-xl font-bold">Report {targetType}</DialogTitle>
                    <DialogDescription>
                        Reporting: <span className="text-foreground font-medium">{targetName || targetId}</span>. {user ? '' : 'Please sign in to submit.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Reason</label>
                        <Select onValueChange={setReason} value={reason}>
                            <SelectTrigger className="bg-white/5 border-white/10">
                                <SelectValue placeholder="Select a reason" />
                            </SelectTrigger>
                            <SelectContent>
                                {getReasons().map((r) => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Additional Details</label>
                        <Textarea
                            placeholder="Please provide more context..."
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            className="bg-white/5 border-white/10 min-h-[100px] resize-none"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !user}
                        className="shadow-lg shadow-destructive/20"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Submit Report
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
