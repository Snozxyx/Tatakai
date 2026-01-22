import { useState } from 'react';
import { useAllWatchRooms, useAdminDeleteRoom } from '@/hooks/useWatchRoom';
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
import { formatDistanceToNow } from 'date-fns';

export function WatchRoomManager() {
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
                    Active Watch Rooms
                </h2>
                <div className="text-sm text-muted-foreground">
                    Total Rooms: {rooms?.length || 0}
                </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="w-[300px]">Room Info</TableHead>
                            <TableHead>Host</TableHead>
                            <TableHead>Content</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Participants</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!rooms || rooms.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    No active watch rooms found
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
                                                Created {formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Avatar className="w-6 h-6">
                                                <AvatarImage src={room.host_profile?.avatar_url || ''} />
                                                <AvatarFallback>{room.host_profile?.display_name?.[0] || '?'}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm">{room.host_profile?.display_name || 'Unknown'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm line-clamp-1">{room.anime_title || 'No Content'}</span>
                                            {room.episode_number && (
                                                <span className="text-xs text-muted-foreground">
                                                    Episode {room.episode_number}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {room.is_playing ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium">
                                                    <MonitorPlay className="w-3 h-3" />
                                                    Playing
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-medium">
                                                    Paused
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
                        <AlertDialogTitle>Delete Watch Room?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the room and disconnect all participants. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                            Delete Room
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
