package eu.kanade.tachiyomi.torrentutils.model

data class TorrentInfo(
    val title: String,
    val files: List<TorrentFile>,
    val hash: String,
    val size: Long,
    val trackers: List<String> = emptyList(),
) {
    fun setTrackers(trackers: List<String>): TorrentInfo = TorrentInfo(title, files, hash, size, trackers)
}

class DeadTorrentException : Exception {
    constructor() : super()
    constructor(message: String) : super(message)
    constructor(message: String, cause: Throwable) : super(message, cause)
    constructor(cause: Throwable) : super(cause)
}
