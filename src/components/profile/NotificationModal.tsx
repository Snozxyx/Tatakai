import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useNotifications } from "@/hooks/useNotifications";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Bell, Check, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NotificationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function NotificationModal({ open, onOpenChange }: NotificationModalProps) {
    const { data: notifications = [], isLoading, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-background/80 backdrop-blur-xl border-white/5">
                <DialogHeader className="p-6 border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <Bell className="w-6 h-6 text-primary" />
                            Notifications
                            {unreadCount > 0 && (
                                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold ml-2">
                                    {unreadCount} NEW
                                </span>
                            )}
                        </DialogTitle>
                        {notifications.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs font-bold hover:bg-primary/10 hover:text-primary transition-colors h-8"
                                onClick={() => markAllAsRead.mutate()}
                                disabled={unreadCount === 0 || markAllAsRead.isPending}
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                Mark all as read
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                <ScrollArea className="max-h-[70vh]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Loading Transmission...</p>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
                            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                                <Bell className="w-8 h-8 text-muted-foreground/30" />
                            </div>
                            <h3 className="text-lg font-bold mb-1">Silence is Golden</h3>
                            <p className="text-muted-foreground text-sm max-w-xs">You have no new notifications. We'll let you know when something interesting happens!</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={cn(
                                        "p-4 transition-all flex justify-between items-start gap-4 group hover:bg-white/5",
                                        !notification.read && "bg-primary/[0.03]"
                                    )}
                                >
                                    <div className="flex-1 min-w-0" onClick={() => !notification.read && markAsRead.mutate(notification.id)}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className={cn(
                                                "font-bold text-sm leading-tight transition-colors",
                                                notification.read ? "text-muted-foreground" : "text-foreground group-hover:text-primary"
                                            )}>
                                                {notification.title}
                                            </h4>
                                            {!notification.read && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                                            )}
                                        </div>
                                        <p className={cn(
                                            "text-xs leading-relaxed line-clamp-3 mb-2",
                                            notification.read ? "text-muted-foreground/60" : "text-muted-foreground"
                                        )}>
                                            {notification.body}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40">
                                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                            </span>
                                            {!notification.read && (
                                                <span className="text-[10px] uppercase font-black tracking-widest text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">NEW</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!notification.read && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => markAsRead.mutate(notification.id)}
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/20 bg-primary/5 rounded-lg"
                                            >
                                                <Check className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                if (confirm('Delete notification?')) deleteNotification.mutate(notification.id);
                                            }}
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/20 bg-destructive/5 rounded-lg"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t border-white/5 bg-black/20 flex justify-center">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">Transmission Protocol Active</p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
