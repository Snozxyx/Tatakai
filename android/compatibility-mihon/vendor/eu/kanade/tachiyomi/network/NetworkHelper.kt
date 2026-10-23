package eu.kanade.tachiyomi.network

import android.content.Context
import eu.kanade.tachiyomi.network.interceptor.CloudflareInterceptor
import eu.kanade.tachiyomi.network.interceptor.IgnoreGzipInterceptor
import eu.kanade.tachiyomi.network.interceptor.UncaughtExceptionInterceptor
import eu.kanade.tachiyomi.network.interceptor.UserAgentInterceptor
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.brotli.BrotliInterceptor
import okhttp3.logging.HttpLoggingInterceptor
import java.nio.file.Files
import java.util.concurrent.TimeUnit

class NetworkHelper(
    val context: Context,
) {
    val cookieJar = AndroidCookieJar()

    val client by lazy {
        val builder =
            OkHttpClient
                .Builder()
                .cookieJar(cookieJar)
                .addInterceptor(UncaughtExceptionInterceptor())
                .addInterceptor(
                    CloudflareInterceptor(
                        ::cloudflareProxyUrlProvider,
                        ::setUA,
                        cookieJar::addAll,
                    ),
                )
                .addInterceptor(UserAgentInterceptor(::defaultUserAgentProvider))
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .callTimeout(2, TimeUnit.MINUTES)
                .cache(
                    Cache(
                        directory = Files.createTempDirectory("m_network_cache").toFile(),
                        maxSize = 5L * 1024 * 1024, // 5 MiB
                    ),
                )
        builder.build()
    }

    val cloudflareClient by lazy {
        client
    }

    private var defaultUserAgent: String = System.getProperty("http.agent").orEmpty()

    fun setUA(ua: String) {
        defaultUserAgent = ua
    }

    fun defaultUserAgentProvider() = defaultUserAgent

    private var cloudflareProxyUrl: String = ""

    /** URL of a FlareSolverr- / Byparr-compatible proxy, or "" to disable. */
    fun setCloudflareProxyUrl(url: String) {
        cloudflareProxyUrl = url
    }

    fun cloudflareProxyUrlProvider() = cloudflareProxyUrl
}
