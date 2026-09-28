import { WatchRoomProvider } from '@/components/watch/room/WatchRoomContext';
import { WatchRoomLayout } from '@/components/watch/room/WatchRoomLayout';

export default function WatchRoomPage() {
    return (
        <WatchRoomProvider>
            <WatchRoomLayout />
        </WatchRoomProvider>
    );
}
