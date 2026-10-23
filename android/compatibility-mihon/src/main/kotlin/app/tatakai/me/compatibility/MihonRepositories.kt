package app.tatakai.me.compatibility

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/** Bounded native repository reader. Source IDs stay decimal strings. */
internal object MihonRepositories {
    private const val LIMIT = 16 * 1024 * 1024
    fun https(value: String): URL = URL(value).also {
        require(it.protocol == "https" && it.userInfo == null) { "Use an HTTPS URL without login credentials" }
    }
    fun bytes(url: String, limit: Int = LIMIT): ByteArray {
        val connection = https(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15000; connection.readTimeout = 30000
        try {
            require(connection.responseCode == 200 && connection.url.protocol == "https") { "Repository download failed" }
            require(connection.contentLengthLong <= limit) { "Repository response too large" }
            return connection.inputStream.use { input ->
                val output = ByteArrayOutputStream(); val buffer = ByteArray(16384)
                while (true) {
                    if (Thread.currentThread().isInterrupted) throw InterruptedIOException("Repository request cancelled")
                    val count = input.read(buffer); if (count < 0) break
                    require(output.size() + count <= limit) { "Repository response too large" }; output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
        } finally { connection.disconnect() }
    }
    private fun decompressed(input: ByteArray): ByteArray {
        if (input.size < 2 || input[0] != 0x1f.toByte() || input[1] != 0x8b.toByte()) return input
        return GZIPInputStream(ByteArrayInputStream(input)).use { stream ->
            val output = ByteArrayOutputStream(); val buffer = ByteArray(16384)
            while (true) { val count = stream.read(buffer); if (count < 0) break; require(output.size() + count <= LIMIT) { "Inflated repository too large" }; output.write(buffer, 0, count) }
            output.toByteArray()
        }
    }
    private class Wire(private val data: ByteArray) {
        private var at = 0
        val fields = mutableMapOf<Int, MutableList<Any>>()
        private fun integer(): Long {
            var value = 0L
            for (shift in 0..63 step 7) {
                require(at < data.size) { "Truncated protobuf" }; val byte = data[at++].toInt() and 255
                require(shift < 63 || byte <= 1) { "Protobuf overflow" }
                value = value or ((byte and 127).toLong() shl shift)
                if (byte and 128 == 0) return value
            }
            error("Oversized protobuf integer")
        }
        init {
            require(data.size <= LIMIT)
            while (at < data.size) {
                val tag = integer(); val field = (tag ushr 3).toInt(); require(field in 1..536870911)
                val value: Any = when ((tag and 7).toInt()) {
                    0 -> integer()
                    1, 2, 5 -> {
                        val length = when ((tag and 7).toInt()) { 1 -> 8L; 5 -> 4L; else -> integer() }
                        require(length in 0..(data.size - at).toLong()) { "Invalid protobuf length" }
                        data.copyOfRange(at, at + length.toInt()).also { at += length.toInt() }
                    }
                    else -> error("Unsupported protobuf wire type")
                }
                fields.getOrPut(field) { mutableListOf() }.add(value)
            }
        }
        fun text(field: Int) = (fields[field]?.firstOrNull() as? ByteArray)?.toString(Charsets.UTF_8).orEmpty()
        fun number(field: Int) = fields[field]?.firstOrNull() as? Long ?: 0L
        fun message(field: Int) = Wire(fields[field]?.firstOrNull() as? ByteArray ?: byteArrayOf())
        fun messages(field: Int) = fields[field].orEmpty().map { Wire(it as ByteArray) }
    }
    fun read(url: String): JSONObject = read(url, mutableSetOf())
    private fun read(url: String, visited: MutableSet<String>): JSONObject {
        require(visited.size < 4 && visited.add(url)) { "Recursive repository index" }
        val raw = decompressed(bytes(url)); val first = raw.firstOrNull()?.toInt()
        if (first == '{'.code) {
            val metadata = JSONObject(raw.toString(Charsets.UTF_8))
            val index = metadata.optString("index_v2").ifBlank { metadata.optString("indexUrl") }
            require(index.isNotBlank()) { "This repository metadata has no supported native index" }
            return read(URL(https(url), index).toString(), visited)
        }
        val root = Wire(raw)
        val fingerprint = root.text(3).lowercase()
        require(fingerprint.matches(Regex("[a-f0-9]{64}"))) { "Repository must declare a SHA-256 signing fingerprint" }
        val list = if (root.fields.containsKey(101)) root.message(101) else {
            val link = root.text(102); require(link.isNotEmpty()) { "Repository has no extension list" }
            Wire(decompressed(bytes(URL(https(url), link).toString())))
        }
        val packages = JSONArray()
        for (entry in list.messages(1)) {
            val resources = entry.message(3)
            packages.put(JSONObject().put("id", entry.text(2)).put("name", entry.text(1)).put("version", entry.text(6))
                .put("versionCode", entry.number(5).toString()).put("url", https(resources.text(1)).toString()).put("signingKey", fingerprint))
        }
        return JSONObject().put("name", root.text(1)).put("signingKey", fingerprint).put("packages", packages)
    }
}
