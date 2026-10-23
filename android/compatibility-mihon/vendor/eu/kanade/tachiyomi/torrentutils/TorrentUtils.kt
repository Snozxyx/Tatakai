package eu.kanade.tachiyomi.torrentutils

import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.torrentutils.model.DeadTorrentException
import eu.kanade.tachiyomi.torrentutils.model.TorrentFile
import eu.kanade.tachiyomi.torrentutils.model.TorrentInfo
import kotlinx.coroutines.runBlocking
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.net.URLDecoder

object TorrentUtils {
    private val network: NetworkHelper
        get() = Injekt.get()

    suspend fun getTorrentInfo(
        url: String,
        title: String,
    ): TorrentInfo {
        return if (url.startsWith("magnet:", ignoreCase = true)) {
            parseMagnetInfo(url, title)
        } else {
            val response = network.client.newCall(GET(url)).awaitSuccess()
            response.use { resp ->
                val body = resp.body ?: throw DeadTorrentException("Empty torrent response body")
                val torrent = TorrentHelpers.parseTorrentDetailsFromTorrentFileContent(body.byteStream())
                TorrentInfo(
                    title = title.ifBlank { torrent.title },
                    files =
                        torrent.files.map { file ->
                            TorrentFile(
                                path = file.path,
                                indexFile = file.index,
                                size = file.length,
                                torrentHash = torrent.hash,
                                trackers = torrent.trackers,
                            )
                        },
                    hash = torrent.hash,
                    size = torrent.size,
                    trackers = torrent.trackers,
                )
            }
        }
    }

    @Deprecated(
        message = "This overload of getTorrentInfo exists for binary compatibility with extensions targeting " +
            "other forks where getTorrentInfo was not a suspend function",
        level = DeprecationLevel.HIDDEN,
    )
    @JvmName("getTorrentInfo")
    fun blockingShimForGetTorrentInfo(
        url: String,
        title: String,
    ): TorrentInfo =
        runBlocking {
            getTorrentInfo(url, title)
        }

    private fun parseMagnetInfo(
        magnetUri: String,
        title: String,
    ): TorrentInfo {
        val query = magnetUri.substringAfter("?", "")
        val params = query.split("&").filter { it.isNotEmpty() }
        var xtHash = ""
        val trackers = mutableListOf<String>()
        var dnTitle = title

        for (param in params) {
            val parts = param.split("=", limit = 2)
            if (parts.size == 2) {
                val key = parts[0]
                val value = runCatching { URLDecoder.decode(parts[1], "UTF-8") }.getOrDefault(parts[1])
                when (key) {
                    "xt" -> {
                        if (value.startsWith("urn:btih:", ignoreCase = true)) {
                            xtHash = value.substring(9)
                        }
                    }
                    "tr" -> trackers.add(value)
                    "dn" -> if (dnTitle.isBlank()) dnTitle = value
                }
            }
        }

        if (xtHash.isBlank()) {
            throw DeadTorrentException("Invalid magnet link: missing xt hash")
        }

        val file =
            TorrentFile(
                path = dnTitle.ifBlank { "Episode" },
                indexFile = 1,
                size = 0L,
                torrentHash = xtHash,
                trackers = trackers,
            )

        return TorrentInfo(
            title = dnTitle.ifBlank { "Torrent" },
            files = listOf(file),
            hash = xtHash,
            size = 0L,
            trackers = trackers,
        )
    }
}
