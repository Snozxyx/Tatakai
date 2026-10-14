package app.tatakai.me.torrent;
import java.util.function.IntPredicate;

/** Verified byte window for a range, independent of holes before that range. */
public final class TorrentPieceWindow {
    private TorrentPieceWindow() {}
    public static long verifiedEnd(long offset, long length, long start, int pieceLength, IntPredicate hasPiece) {
        if (pieceLength <= 0 || length <= 0 || start < 0 || start >= length) return Math.max(0, Math.min(start, length));
        int first = (int)((offset + start) / pieceLength);
        int last = (int)((offset + length - 1) / pieceLength);
        long end = start;
        for (int piece = first; piece <= last; piece++) {
            if (!hasPiece.test(piece)) break;
            end = Math.min(length, ((long)piece + 1) * pieceLength - offset);
        }
        return end;
    }
}
