package app.tatakai.me.compatibility

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.AtomicFile
import android.util.Base64
import com.android.apksig.ApkVerifier
import eu.kanade.tachiyomi.AppModule
import eu.kanade.tachiyomi.source.CatalogueSource
import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.SourceFactory
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.online.HttpSource
import eu.kanade.tachiyomi.util.system.ChildFirstPathClassLoader
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import eu.kanade.tachiyomi.network.NetworkHelper
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/** Local original-APK host; used by both Android mobile and TV service builds. */
class MihonEngine(private val context: Context) {
    private val root = File(context.filesDir, "compatibility/mihon").apply { mkdirs() }
    private val storage = AtomicFile(File(root, "state.json"))
    private val state: JSONObject = if (storage.baseFile.exists()) JSONObject(storage.readFully().toString(Charsets.UTF_8)) else JSONObject()
        .put("version", 1).put("repositories", JSONArray()).put("packages", JSONObject()).put("enabled", JSONObject())
    private val sources = ConcurrentHashMap<String, Pair<CatalogueSource, JSONObject>>()
    private val loaded = mutableSetOf<String>()
    private val enabled = ConcurrentHashMap<String, Boolean>()
    private val preferences = MihonPreferences(context)
    private val imageServer = lazy { MihonImages { enabled[it] == true } }
    private val images get() = imageServer.value
    init {
        require(state.optInt("version") == 1 && state.has("repositories") && state.has("packages") && state.has("enabled")) { "Invalid Mihon settings; existing file preserved" }
        state.getJSONObject("enabled").let { flags -> flags.keys().forEach { enabled[it] = flags.optBoolean(it) } }
        Injekt.importModule(AppModule(context.applicationContext as Application))
        context.getSharedPreferences("compatibility-browser", Context.MODE_PRIVATE).getString("userAgent", null)?.let { Injekt.get<NetworkHelper>().setUA(it) }
    }
    private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    private fun sourceId(repository: String, pkg: String, upstream: String) = "compat-mihon-" + sha(JSONArray(listOf(repository, pkg, upstream)).toString().toByteArray()).take(32)
    @Synchronized private fun save() {
        state.put("enabled", JSONObject(enabled as Map<*, *>))
        val out = storage.startWrite()
        try { out.write(state.toString().toByteArray()); storage.finishWrite(out) } catch (e: Exception) { storage.failWrite(out); throw e }
    }
    private fun file(pkg: JSONObject) = File(root, "${sha(pkg.getString("id").toByteArray())}.${pkg.getString("digest")}.apk")
    private fun verify(pkg: JSONObject, file: File) {
        require(sha(file.readBytes()) == pkg.getString("digest")) { "Installed APK checksum mismatch" }
        val result = ApkVerifier.Builder(file).setMinCheckedPlatformVersion(26).build().verify()
        require(result.isVerified && result.signerCertificates.size == 1) { "APK signature verification failed" }
        require(sha(result.signerCertificates.single().encoded) == pkg.getString("signingKey")) { "APK signer does not match this repository" }
        val info = context.packageManager.getPackageArchiveInfo(file.path, PackageManager.GET_META_DATA) ?: error("Invalid extension APK")
        val version = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") (info.versionCode.toLong())
        require(info.packageName == pkg.getString("id") && version.toString() == pkg.getString("versionCode")) { "APK identity/version does not match repository metadata" }
    }
    private fun load(pkg: JSONObject): List<Pair<CatalogueSource, JSONObject>> {
        val file = file(pkg); verify(pkg, file); file.setReadOnly()
        val info = context.packageManager.getPackageArchiveInfo(file.path, PackageManager.GET_META_DATA) ?: error("Invalid extension APK")
        val app = info.applicationInfo ?: error("No APK application metadata")
        app.sourceDir = file.path; app.publicSourceDir = file.path
        val metadata = app.metaData ?: error("Extension has no source metadata")
        val names = metadata.getString("tachiyomi.extension.class") ?: metadata.getString("tachiyomix.extension.class") ?: error("APK is not a Mihon manga extension")
        val loader = ChildFirstPathClassLoader(file.path, null, javaClass.classLoader!!)
        val result = mutableListOf<Pair<CatalogueSource, JSONObject>>()
        for (name in names.split(';').filter { it.isNotBlank() }) {
            val clazz = if (name.startsWith('.')) info.packageName + name else name
            val instance = loader.loadClass(clazz).getDeclaredConstructor().newInstance()
            val actual = when (instance) { is SourceFactory -> instance.createSources(); is Source -> listOf(instance); else -> error("Unsupported source entry class") }
            for (source in actual.filterIsInstance<CatalogueSource>()) {
                val id = sourceId(pkg.getString("repository"), pkg.getString("id"), source.id.toString())
                result += source to JSONObject().put("id", id).put("upstreamId", source.id.toString()).put("packageId", pkg.getString("id"))
                    .put("repository", pkg.getString("repository")).put("ecosystem", "mihon").put("extensionName", pkg.getString("name"))
                    .put("name", source.name).put("lang", source.lang).put("kind", "read")
            }
        }
        require(result.isNotEmpty()) { "Extension registered no manga sources" }; return result
    }
    private fun allSources(): JSONArray {
        val packages = state.getJSONObject("packages")
        for (id in packages.keys()) if (!loaded.contains(id)) {
            try {
                val list = load(packages.getJSONObject(id)); for (entry in list) sources[entry.second.getString("id")] = entry
                loaded.add(id); packages.getJSONObject(id).remove("error")
            } catch (e: Throwable) { packages.getJSONObject(id).put("error", e.cause?.message ?: e.message ?: "Source loading failed") }
        }
        return JSONArray(sources.values.map { JSONObject(it.second.toString()).put("enabled", enabled[it.second.getString("id")] == true) })
    }
    private fun catalog(): JSONArray {
        val result = linkedMapOf<String, JSONObject>(); val installed = state.getJSONObject("packages")
        val repos = state.getJSONArray("repositories")
        for (i in 0 until repos.length()) {
            val repository = repos.getJSONObject(i); val store = MihonRepositories.read(repository.getString("url"))
            require(store.getString("signingKey") == repository.getString("signingKey")) { "Repository signing key changed; re-add it after checking the publisher" }
            val packages = store.getJSONArray("packages")
            for (j in 0 until packages.length()) {
                val pkg = packages.getJSONObject(j); val id = pkg.getString("id"); val current = installed.optJSONObject(id)
                require(!result.containsKey(id) || result[id]?.getString("signingKey") == pkg.getString("signingKey")) { "Two repositories offer different signers for the same package" }
                result[id] = pkg.put("repository", repository.getString("url")).put("ecosystem", "mihon").put("installed", current != null)
                    .put("hasUpdate", current != null && pkg.getString("versionCode").toLong() > current.getString("versionCode").toLong())
                    .put("error", current?.opt("error"))
            }
        }
        for (id in installed.keys()) if (!result.containsKey(id)) result[id] = JSONObject(installed.getJSONObject(id).toString()).put("installed", true).put("hasUpdate", false)
        return JSONArray(result.values)
    }
    @Synchronized fun setEnabled(p: JSONObject): Any {
        val id = p.getString("sourceId"); require(sources.containsKey(id) && p.get("enabled") is Boolean) { "Source is not installed" }
        val previous = enabled[id]
        enabled[id] = p.getBoolean("enabled")
        try { save() } catch (error: Exception) { if (previous == null) enabled.remove(id) else enabled[id] = previous; throw error }
        if (enabled[id] != true && imageServer.isInitialized()) images.revoke(id)
        return JSONObject.NULL
    }
    fun request(p: JSONObject): Any {
        require(Build.VERSION.SDK_INT >= 26) { "Mihon extensions require Android 8 or newer" }
        when (p.getString("op")) {
            "prepare" -> return JSONObject().put("ready", true)
            "sources" -> return allSources()
            "installedPackages" -> {
                val result = JSONArray(); val installed = state.getJSONObject("packages")
                for (id in installed.keys()) {
                    val pkg = installed.getJSONObject(id)
                    result.put(JSONObject().put("id", id).put("name", pkg.optString("name", id)).put("version", pkg.optString("version")).put("repository", pkg.optString("repository")).put("ecosystem", "mihon").put("installed", true).put("hasUpdate", false).put("error", pkg.opt("error")))
                }
                return result
            }
            "repositories" -> return state.getJSONArray("repositories")
            "addRepository", "removeRepository" -> {
                val url = MihonRepositories.https(p.getString("url")).toString(); val old = state.getJSONArray("repositories"); val next = JSONArray()
                for (i in 0 until old.length()) if (old.getJSONObject(i).getString("url") != url) next.put(old.getJSONObject(i))
                if (p.getString("op") == "addRepository") { val store = MihonRepositories.read(url); next.put(JSONObject().put("url", url).put("name", store.getString("name")).put("signingKey", store.getString("signingKey")).put("ecosystem", "mihon")) }
                state.put("repositories", next)
                try { save() } catch (error: Exception) { state.put("repositories", old); throw error }
                return JSONObject.NULL
            }
            "packages" -> return catalog()
            "install" -> { install(p.getString("packageId")); return JSONObject.NULL }
            "remove" -> {
                val id = p.getString("packageId"); val pkg = state.getJSONObject("packages").getJSONObject(id)
                val flags = enabled.toMap()
                for (key in sources.keys.toList()) if (sources[key]!!.second.getString("packageId") == id) enabled.remove(key)
                state.getJSONObject("packages").remove(id)
                try { save() } catch (error: Exception) { state.getJSONObject("packages").put(id, pkg); enabled.putAll(flags); throw error }
                for (key in sources.keys.toList()) if (sources[key]!!.second.getString("packageId") == id) { if (imageServer.isInitialized()) images.revoke(key); sources.remove(key) }
                loaded.remove(id); file(pkg).delete(); return JSONObject.NULL
            }
        }
        allSources()
        if (p.getString("op") == "setEnabled") return setEnabled(p)
        val id = p.getString("sourceId"); val (source, _) = sources[id] ?: error("Source is not installed")
        if (p.getString("op") == "preferences") return preferences.read(source)
        if (p.getString("op") == "setPreference") return preferences.change(source, p.getInt("position"), p.get("value"))
        require(enabled[id] == true) { "Source is disabled" }
        val result: Any = runBlocking {
            withTimeout(45000) {
                when (p.getString("op")) {
                    "search", "browse" -> {
                        val query = p.optString("query").trim().take(300); val page = p.optInt("page", 1).coerceIn(1, 100)
                        val found = if (query.isEmpty()) source.getPopularManga(page) else source.getSearchManga(page, query, source.getFilterList())
                        JSONObject().put("hasNextPage", found.hasNextPage).put("results", JSONArray(found.mangas.map { manga ->
                            JSONObject().put("id", token(id, manga.url)).put("title", manga.title).put("image", image(id, source, manga.thumbnail_url))
                        }))
                    }
                    "info", "chapters" -> {
                        val url = decoded(id, p.getString("id")); val manga = SManga.create().apply { this.url = url; title = url }
                        val update = source.getMangaUpdate(manga, emptyList(), true, true)
                        val details = update.manga
                        JSONObject().put("id", token(id, url)).put("title", details.title).put("description", details.description).put("image", image(id, source, details.thumbnail_url))
                            .put("entries", JSONArray(update.chapters.sortedBy { it.chapter_number }.map { chapter -> JSONObject().put("id", token(id, chapter.url)).put("label", chapter.name).put("number", chapter.chapter_number.toDouble()) }))
                    }
                    "pages" -> {
                        val chapter = SChapter.create().apply { url = decoded(id, p.getString("chapterId")) }
                        val pages = source.getPageList(chapter)
                        val http = source as? HttpSource ?: error("This source requires a custom image adapter")
                        JSONObject().put("pages", JSONArray(pages.mapIndexed { index, page -> JSONObject().put("pageNumber", index + 1).put("imageUrl", images.register(id, http, page = page))
                            .put("resourceIdentity", sha(JSONArray(listOf(id, chapter.url, index)).toString().toByteArray())) }))
                    }
                    else -> error("Unsupported Mihon operation")
                }
            }
        }
        require(enabled[id] == true) { "Source was disabled" }; return result
    }
    private fun image(id: String, source: CatalogueSource, url: String?): String? = if (url.isNullOrBlank()) null else (source as? HttpSource)?.let { images.register(id, it, url = url) } ?: url
    fun authenticationUrl(id: String): String {
        allSources()
        return (sources[id]?.first as? HttpSource)?.baseUrl ?: error("This source has no HTTP sign-in adapter")
    }
    fun authenticated(userAgent: String) {
        require(userAgent.isNotBlank() && userAgent.length <= 1000)
        Injekt.get<NetworkHelper>().setUA(userAgent)
        check(context.getSharedPreferences("compatibility-browser", Context.MODE_PRIVATE).edit().putString("userAgent", userAgent).commit()) { "Could not save browser user agent" }
    }
    private fun token(id: String, url: String) = Base64.encodeToString(JSONArray(listOf(id, url)).toString().toByteArray(), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    private fun decoded(id: String, token: String): String {
        require(token.length <= 20000); val data = JSONArray(Base64.decode(token, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING).toString(Charsets.UTF_8))
        require(data.length() == 2 && data.getString(0) == id) { "Content does not belong to this source" }; return data.getString(1)
    }
    private fun install(id: String) {
        val catalog = catalog(); val candidate = (0 until catalog.length()).map { catalog.getJSONObject(it) }.firstOrNull { it.getString("id") == id } ?: error("Package is not in an added repository")
        require(id.matches(Regex("[a-zA-Z0-9_.]{1,200}"))) { "Invalid extension package" }
        val bytes = MihonRepositories.bytes(candidate.getString("url"), 50 * 1024 * 1024); candidate.put("digest", sha(bytes))
        val installed = state.getJSONObject("packages"); val previous = installed.optJSONObject(id); val target = file(candidate)
        if (!target.exists()) { val partial = File(target.path + ".partial"); partial.outputStream().use { it.write(bytes) }; require(partial.renameTo(target)) { "Cannot activate verified APK" } }
        val loadedSources = load(candidate) // Signature, metadata and original source constructors must pass first.
        if (Thread.currentThread().isInterrupted) throw java.io.InterruptedIOException("APK installation cancelled")
        installed.put(id, candidate)
        try { save() } catch (error: Exception) { if (previous == null) installed.remove(id) else installed.put(id, previous); throw error }
        for (key in sources.keys.toList()) if (sources[key]!!.second.getString("packageId") == id) { images.revoke(key); sources.remove(key) }
        for (entry in loadedSources) sources[entry.second.getString("id")] = entry
        loaded.add(id)
    }
    fun stop() { if (imageServer.isInitialized()) images.stop() }
}
