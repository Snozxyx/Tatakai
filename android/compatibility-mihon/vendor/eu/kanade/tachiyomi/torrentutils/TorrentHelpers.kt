package eu.kanade.tachiyomi.torrentutils

import eu.kanade.tachiyomi.torrentutils.bencode.BencodeParser
import eu.kanade.tachiyomi.torrentutils.bencode.BencodeValue
import eu.kanade.tachiyomi.torrentutils.bencode.BencodeWriter
import java.io.InputStream
import java.io.OutputStream
import java.security.DigestOutputStream
import java.security.MessageDigest

data class TorrentParsedDetails(
    val title: String,
    val hash: String,
    val size: Long,
    val trackers: List<String>,
    val files: List<TorrentParsedFile>,
)

data class TorrentParsedFile(
    val index: Int,
    val path: String,
    val length: Long,
)

object TorrentHelpers {
    fun parseTorrentDetailsFromTorrentFileContent(torrentFileContent: InputStream): TorrentParsedDetails {
        try {
            val parsed = BencodeParser.parse(torrentFileContent) as BencodeValue.Dictionary
            val infoDictionary = parsed.getByString("info") as BencodeValue.Dictionary

            val title = (infoDictionary.getByString("name") as BencodeValue.ByteString).toUTF8String()
            val hash = calculateInfoHash(infoDictionary)

            val trackers = ArrayList<String>()
            parsed.getByString("announce")?.let {
                trackers.add((it as BencodeValue.ByteString).toUTF8String())
            }
            parsed.getByString("announce-list")?.let {
                for (trackerList in (it as BencodeValue.List).value) {
                    for (tracker in (trackerList as BencodeValue.List).value) {
                        trackers.add((tracker as BencodeValue.ByteString).toUTF8String())
                    }
                }
            }

            val lengthEntry = infoDictionary.getByString("length") as BencodeValue.Integer?
            val filesEntry = infoDictionary.getByString("files") as BencodeValue.List?

            val (torrentSize: Long, fileStats: List<TorrentParsedFile>) =
                when {
                    lengthEntry !== null && filesEntry === null -> {
                        lengthEntry.value to listOf(TorrentParsedFile(1, title, lengthEntry.value))
                    }
                    filesEntry !== null && lengthEntry === null -> {
                        var totalSizeAcc: Long = 0
                        val files =
                            filesEntry.value.mapIndexed { i, file ->
                                val fileAsDict = file as BencodeValue.Dictionary
                                val fileSize = (fileAsDict.getByString("length") as BencodeValue.Integer).value
                                val pathList = fileAsDict.getByString("path") as BencodeValue.List
                                val filePath =
                                    pathList.value.joinToString("/") {
                                        (it as BencodeValue.ByteString).toUTF8String()
                                    }

                                totalSizeAcc += fileSize
                                TorrentParsedFile(
                                    index = i + 1,
                                    path = filePath,
                                    length = fileSize,
                                )
                            }
                        totalSizeAcc to files
                    }
                    else -> throw RuntimeException("Invalid torrent file")
                }

            return TorrentParsedDetails(
                title = title,
                hash = hash,
                size = torrentSize,
                trackers = trackers,
                files = fileStats,
            )
        } catch (e: ClassCastException) {
            throw RuntimeException("Invalid torrent file", e)
        }
    }

    private fun calculateInfoHash(infoDictionary: BencodeValue): String {
        class NullOutputStream : OutputStream() {
            override fun write(b: Int) {}
            override fun write(b: ByteArray, off: Int, len: Int) {}
        }

        val md = MessageDigest.getInstance("SHA-1")
        BencodeWriter.write(infoDictionary, DigestOutputStream(NullOutputStream(), md))
        val digestBytes = md.digest()

        val sb = StringBuilder(digestBytes.size * 2)
        for (b in digestBytes) {
            sb.append(String.format("%02x", b))
        }
        return sb.toString()
    }
}
