package eu.kanade.tachiyomi.animesource.online

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import eu.kanade.tachiyomi.animesource.AnimeCatalogueSource
import eu.kanade.tachiyomi.animesource.model.AnimeFilterList
import eu.kanade.tachiyomi.animesource.model.AnimesPage
import eu.kanade.tachiyomi.animesource.model.Hoster
import eu.kanade.tachiyomi.animesource.model.HttpServer
import eu.kanade.tachiyomi.animesource.model.SAnime
import eu.kanade.tachiyomi.animesource.model.SEpisode
import eu.kanade.tachiyomi.animesource.model.ThumbnailInfo
import eu.kanade.tachiyomi.animesource.model.Video
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.NetworkHelper
import eu.kanade.tachiyomi.network.asObservableSuccess
import eu.kanade.tachiyomi.network.awaitSuccess
import eu.kanade.tachiyomi.network.newCachelessCallWithProgress
import eu.kanade.tachiyomi.util.lang.awaitSingle
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import rx.Observable
import uy.kohesive.injekt.injectLazy
import java.net.URI
import java.net.URISyntaxException
import java.security.MessageDigest

/**
 * A simple implementation for sources from a website.
 */
@Suppress("unused")
abstract class AnimeHttpSource : AnimeCatalogueSource {
    /**
     * Network service.
     */
    val network: NetworkHelper by injectLazy()

    /**
     * Base url of the website without the trailing slash, like: http://mysite.com
     */
    abstract val baseUrl: String

    /**
     * Returns the base (home) URL of the website as a string.
     *
     * @return The website’s home page URL. Defaults to [baseUrl].
     */
    open fun getHomeUrl(): String = baseUrl

    /**
     * Version id used to generate the source id. If the site completely changes and urls are
     * incompatible, you may increase this value and it'll be considered as a new source.
     */
    open val versionId = 1

    /**
     * ID of the source. By default it uses a generated id using the first 16 characters (64 bits)
     * of the MD5 of the string `"${name.lowercase()}/$lang/$versionId"`.
     *
     * Note: the generated ID sets the sign bit to `0`.
     */
    override val id by lazy { generateId(name, lang, versionId) }

    /**
     * Headers used for requests.
     */
    val headers: Headers by lazy { headersBuilder().build() }

    /**
     * Default network client for doing requests.
     */
    open val client: OkHttpClient
        get() = network.client

    /**
     * Generates a unique ID for the source based on the provided [name], [lang] and [versionId].
     */
    @Suppress("MemberVisibilityCanBePrivate")
    protected fun generateId(
        name: String,
        lang: String,
        versionId: Int,
    ): Long {
        val key = "${name.lowercase()}/$lang/$versionId"
        val bytes = MessageDigest.getInstance("MD5").digest(key.toByteArray())
        return (0..7).map { bytes[it].toLong() and 0xff shl 8 * (7 - it) }.reduce(Long::or) and Long.MAX_VALUE
    }

    /**
     * Headers builder for requests. Implementations can override this method for custom headers.
     */
    protected open fun headersBuilder() =
        Headers.Builder().apply {
            add("User-Agent", network.defaultUserAgentProvider())
        }

    /**
     * Visible name of the source.
     */
    override fun toString() = "$name (${lang.uppercase()})"

    @Suppress("DEPRECATION")
    override fun fetchPopularAnime(page: Int): Observable<AnimesPage> =
        client
            .newCall(popularAnimeRequest(page))
            .asObservableSuccess()
            .map { response ->
                popularAnimeParse(response)
            }

    protected open fun popularAnimeRequest(page: Int): Request = throw UnsupportedOperationException()

    protected open fun popularAnimeParse(response: Response): AnimesPage = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override fun fetchSearchAnime(
        page: Int,
        query: String,
        filters: AnimeFilterList,
    ): Observable<AnimesPage> =
        Observable.defer {
            try {
                client.newCall(searchAnimeRequest(page, query, filters)).asObservableSuccess()
            } catch (e: NoClassDefFoundError) {
                client.newCall(searchAnimeRequest(page, query, filters)).asObservableSuccess()
            }
        }.map { response ->
            searchAnimeParse(response)
        }

    protected open fun searchAnimeRequest(
        page: Int,
        query: String,
        filters: AnimeFilterList,
    ): Request = throw UnsupportedOperationException()

    protected open fun searchAnimeParse(response: Response): AnimesPage = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override fun fetchLatestUpdates(page: Int): Observable<AnimesPage> =
        client
            .newCall(latestUpdatesRequest(page))
            .asObservableSuccess()
            .map { response ->
                latestUpdatesParse(response)
            }

    protected open fun latestUpdatesRequest(page: Int): Request = throw UnsupportedOperationException()

    protected open fun latestUpdatesParse(response: Response): AnimesPage = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override suspend fun getAnimeDetails(anime: SAnime): SAnime = fetchAnimeDetails(anime).awaitSingle()

    @Suppress("DEPRECATION")
    override fun fetchAnimeDetails(anime: SAnime): Observable<SAnime> =
        client
            .newCall(animeDetailsRequest(anime))
            .asObservableSuccess()
            .map { response ->
                animeDetailsParse(response).apply { initialized = true }
            }

    open fun animeDetailsRequest(anime: SAnime): Request = GET(baseUrl + anime.url, headers)

    protected open fun animeDetailsParse(response: Response): SAnime = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override suspend fun getEpisodeList(anime: SAnime): List<SEpisode> = fetchEpisodeList(anime).awaitSingle()

    @Suppress("DEPRECATION")
    override fun fetchEpisodeList(anime: SAnime): Observable<List<SEpisode>> =
        client
            .newCall(episodeListRequest(anime))
            .asObservableSuccess()
            .map { response ->
                episodeListParse(response)
            }

    protected open fun episodeListRequest(anime: SAnime): Request = GET(baseUrl + anime.url, headers)

    protected open fun episodeListParse(response: Response): List<SEpisode> = throw UnsupportedOperationException()

    protected open fun episodeVideoParse(response: Response): SEpisode = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override suspend fun getSeasonList(anime: SAnime): List<SAnime> =
        client
            .newCall(seasonListRequest(anime))
            .awaitSuccess()
            .let { response ->
                seasonListParse(response)
            }

    protected open fun seasonListRequest(anime: SAnime): Request = GET(baseUrl + anime.url, headers)

    protected open fun seasonListParse(response: Response): List<SAnime> = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override suspend fun getHosterList(episode: SEpisode): List<Hoster> =
        client
            .newCall(hosterListRequest(episode))
            .awaitSuccess()
            .let { response ->
                hosterListParse(response)
            }

    protected open fun hosterListRequest(episode: SEpisode): Request = GET(baseUrl + episode.url, headers)

    protected open fun hosterListParse(response: Response): List<Hoster> = throw UnsupportedOperationException()

    @Suppress("DEPRECATION")
    override suspend fun getVideoList(hoster: Hoster): List<Video> =
        client
            .newCall(videoListRequest(hoster))
            .awaitSuccess()
            .let { response ->
                videoListParse(response, hoster)
            }

    protected open fun videoListRequest(hoster: Hoster): Request = GET(hoster.hosterUrl, headers)

    protected open fun videoListParse(
        response: Response,
        hoster: Hoster,
    ): List<Video> = throw UnsupportedOperationException()

    open suspend fun resolveVideo(video: Video): Video? = video

    open fun createHttpServer(): HttpServer? = null

    open suspend fun getVideoThumbnails(video: Video): ThumbnailInfo? = null

    open suspend fun getImageTile(url: String): Bitmap? =
        client.newCall(GET(url, headers)).execute().body.byteStream().use {
            BitmapFactory.decodeStream(it)
        }

    override suspend fun getVideoList(episode: SEpisode): List<Video> {
        @Suppress("DEPRECATION")
        return fetchVideoList(episode).awaitSingle()
    }

    @Suppress("DEPRECATION")
    override fun fetchVideoList(episode: SEpisode): Observable<List<Video>> =
        client
            .newCall(videoListRequest(episode))
            .asObservableSuccess()
            .map { response ->
                videoListParse(response)
            }

    protected open fun videoListRequest(episode: SEpisode): Request = GET(baseUrl + episode.url, headers)

    protected open fun videoListParse(response: Response): List<Video> = throw UnsupportedOperationException()

    open fun List<Hoster>.sortHosters(): List<Hoster> = this

    open fun List<Video>.sortVideos(): List<Video> {
        @Suppress("DEPRECATION")
        return sort()
    }

    @Deprecated("Use .sortVideos() instead", replaceWith = ReplaceWith("sortVideos"))
    protected open fun List<Video>.sort(): List<Video> = this

    @Suppress("DEPRECATION")
    open suspend fun getVideoUrl(video: Video): String = fetchVideoUrl(video).awaitSingle()

    @Suppress("DEPRECATION")
    @Deprecated("Use resolveVideo for lazy loading instead", replaceWith = ReplaceWith("resolveVideo"))
    open fun fetchVideoUrl(video: Video): Observable<String> =
        client
            .newCall(videoUrlRequest(video))
            .asObservableSuccess()
            .map { videoUrlParse(it) }

    protected open fun videoUrlRequest(video: Video): Request = GET(video.url, headers)

    protected open fun videoUrlParse(response: Response): String = throw UnsupportedOperationException()

    @Suppress("Unused")
    fun SEpisode.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    @Suppress("Unused")
    fun SAnime.setUrlWithoutDomain(url: String) {
        this.url = getUrlWithoutDomain(url)
    }

    private fun getUrlWithoutDomain(orig: String): String =
        try {
            val uri = URI(orig)
            var out = uri.path
            if (uri.query != null) {
                out += "?" + uri.query
            }
            if (uri.fragment != null) {
                out += "#" + uri.fragment
            }
            out
        } catch (_: URISyntaxException) {
            orig
        }

    open fun getAnimeUrl(anime: SAnime): String = animeDetailsRequest(anime).url.toString()

    @Suppress("Unused")
    open fun getEpisodeUrl(episode: SEpisode): String = episode.url

    open fun prepareNewEpisode(
        episode: SEpisode,
        anime: SAnime,
    ) {}
}
