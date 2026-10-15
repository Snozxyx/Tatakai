import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useAllWatchRooms, useAdminDeleteRoom } from '@/hooks/media/useWatchRoom';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Radio, Trash2, Users, MonitorPlay, Lock, Globe, Mail } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/localeFormat';

export function WatchRoomManager() {
  useUiTranslation();
    const { data: rooms, isLoading } = useAllWatchRooms();
    const deleteMutation = useAdminDeleteRoom();
    const [roomToDelete, setRoomToDelete] = useState<string | null>(null);

    const handleDelete = async () => {
        if (roomToDelete) {
            await deleteMutation.mutateAsync(roomToDelete);
            setRoomToDelete(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                    <Radio className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.active_watch_rooms_1f013d15')}
                </h2>
                <div className="text-sm text-muted-foreground">
                    {uiI18n.t('app.total_rooms_64116527')} {rooms?.length || 0}
                </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="w-[300px]">{uiI18n.t('app.room_info_5c311bbe')}</TableHead>
                            <TableHead>{uiI18n.t('app.host_3960ec4c')}</TableHead>
                            <TableHead>{uiI18n.t('app.content_4f9be057')}</TableHead>
                            <TableHead>{uiI18n.t('app.status_bae7d5be')}</TableHead>
                            <TableHead className="text-right">{uiI18n.t('app.participants_cd56e083')}</TableHead>
                            <TableHead className="text-right">{uiI18n.t('app.actions_c3cd636a')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!rooms || rooms.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    {uiI18n.t('app.no_active_watch_rooms_found_2f4cfed5')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            rooms.map((room) => (
                                <TableRow key={room.id} className="border-white/5 hover:bg-white/5">
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="font-medium flex items-center gap-2">
                                                {room.name}
                                                {room.access_type === 'public' && <Globe className="w-3 h-3 text-emerald-500" />}
                                                {room.access_type === 'password' && <Lock className="w-3 h-3 text-orange-500" />}
                                                {room.access_type === 'invite' && <Mail className="w-3 h-3 text-blue-500" />}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {uiI18n.t('app.created_accf40c8')} {formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="w-6 h-6">
                                                <AvatarImage src={room.host_profile?.avatar_url || ''} />
                                                <AvatarFallback>{room.host_profile?.display_name?.[0] || '?'}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm">{room.host_profile?.display_name || uiI18n.t('app.unknown_bc7819b3')}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm line-clamp-1">{room.anime_title || uiI18n.t('app.no_content_6c0b05ca')}</span>
                                            {room.episode_number && (
                                                <span className="text-xs text-muted-foreground">
                                                    {uiI18n.t('app.episode_8669aa56')} {room.episode_number}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {room.is_playing ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium">
                                                    <MonitorPlay className="w-3 h-3" />
                                                    {uiI18n.t('app.playing_298c3905')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-medium">
                                                    {uiI18n.t('app.paused_c7dfb6f1')}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                                            <Users className="w-3.5 h-3.5" />
                                            {room.participant_count || 0}/{room.max_participants}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setRoomToDelete(room.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!roomToDelete} onOpenChange={(open) => !open && setRoomToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{uiI18n.t('app.delete_watch_room_e314785d')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {uiI18n.t('app.this_will_permanently_delete_the_room_and_discon_828f073f')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{uiI18n.t('app.cancel_77dfd213')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                            {uiI18n.t('app.delete_room_8680da80')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
