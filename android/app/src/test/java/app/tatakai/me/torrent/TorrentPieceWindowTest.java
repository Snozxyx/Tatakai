package app.tatakai.me.torrent;
import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class TorrentPieceWindowTest {
    @Test public void neverReadsAcrossUnverifiedHoles() {
        assertEquals(2048, TorrentPieceWindow.verifiedEnd(0, 8192, 0, 1024, piece -> piece < 2 || piece > 4));
    }
    @Test public void seeksDoNotWaitForMissingEarlierPieces() {
        assertEquals(6144, TorrentPieceWindow.verifiedEnd(0, 8192, 4096, 1024, piece -> piece == 4 || piece == 5));
    }
    @Test public void handlesUnalignedFilesAndPartialLastPiece() {
        assertEquals(3000, TorrentPieceWindow.verifiedEnd(100, 3000, 0, 1024, piece -> true));
    }
    @Test public void aMissingFirstPieceExposesNoSparseBytes() {
        assertEquals(4096, TorrentPieceWindow.verifiedEnd(0, 8192, 4096, 1024, piece -> false));
    }
}
