package eu.kanade.tachiyomi.torrentutils.model

import java.net.URLEncoder

data class TorrentFile(
    val path: String,
    val indexFile: Int,
    val size: Long,
    val torrentHash: String,
    val trackers: List<String> = emptyList(),
) {
    fun toMagnetURI(): String {
        val encodedTrackers = trackers.joinToString("&tr=") { URLEncoder.encode(it, "UTF-8") }
        return "magnet:?xt=urn:btih:$torrentHash${if (encodedTrackers.isNotEmpty()) "&tr=$encodedTrackers" else ""}&index=$indexFile"
    }
}
