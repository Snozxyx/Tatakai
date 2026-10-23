package app.tatakai.me.compatibility

import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.online.HttpSource
import fi.iki.elonen.NanoHTTPD
import okhttp3.Request
import okhttp3.Response as HttpResponse
import java.io.FilterInputStream
import java.io.IOException
import java.util.UUID

/** Images stay inside the original source's client/interceptors/cookie jar. */
internal class MihonImages(private val enabled: (String) -> Boolean) : NanoHTTPD("127.0.0.1", 0) {
    private val badGateway = object : Response.IStatus {
        override fun getRequestStatus() = 502
        override fun getDescription() = "502 Bad Gateway"
    }
    private data class Entry(val sourceId: String, val source: HttpSource, val page: Page?, val url: String?, val created: Long = System.currentTimeMillis())
    private val entries = LinkedHashMap<String, Entry>()
    private val limit = 32L * 1024 * 1024
    init { start(SOCKET_READ_TIMEOUT, true) }
    @Synchronized fun register(sourceId: String, source: HttpSource, page: Page? = null, url: String? = null): String {
        entries.entries.removeAll { System.currentTimeMillis() - it.value.created > 20 * 60 * 1000 }
        while (entries.size >= 4096) entries.remove(entries.keys.first())
        val token = UUID.randomUUID().toString(); entries[token] = Entry(sourceId, source, page, url)
        return "http://127.0.0.1:$listeningPort/image/$token"
    }
    @Synchronized fun revoke(sourceId: String) { entries.entries.removeAll { it.value.sourceId == sourceId } }
    override fun serve(session: IHTTPSession): Response {
        if (session.method != Method.GET && session.method != Method.HEAD) return newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, MIME_PLAINTEXT, "GET required")
        val entry = synchronized(this) { entries[session.uri.removePrefix("/image/")] }
            ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Image expired")
        if (!enabled(entry.sourceId)) return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Source disabled")
        var upstream: HttpResponse? = null
        return try {
            upstream = if (entry.page != null) entry.source.fetchImage(entry.page).timeout(45, java.util.concurrent.TimeUnit.SECONDS).toBlocking().single()
            else entry.source.client.newCall(Request.Builder().url(entry.url!!).headers(entry.source.headers).build()).execute()
            val response = upstream
            if (!response.isSuccessful) { response.close(); return newFixedLengthResponse(badGateway, MIME_PLAINTEXT, "Source image request failed") }
            val body = response.body; require(body.contentLength() <= limit) { "Image too large" }
            val stream = object : FilterInputStream(body.byteStream()) {
                private var bytes = 0L
                override fun read(): Int { val value = super.read(); if (value >= 0 && ++bytes > limit) throw IOException("Image too large"); return value }
                override fun read(buffer: ByteArray, offset: Int, length: Int): Int { val count = `in`.read(buffer, offset, length); if (count > 0) { bytes += count; if (bytes > limit) throw IOException("Image too large") }; return count }
                override fun close() { try { super.close() } finally { response.close() } }
            }
            newChunkedResponse(Response.Status.OK, body.contentType()?.toString() ?: "application/octet-stream", stream).also {
                it.addHeader("Access-Control-Allow-Origin", "*"); it.addHeader("Cache-Control", "private, max-age=300")
            }
        } catch (_: Exception) { upstream?.close(); newFixedLengthResponse(badGateway, MIME_PLAINTEXT, "Source image request failed") }
    }
    override fun stop() { synchronized(this) { entries.clear() }; super.stop() }
}
