package eu.kanade.tachiyomi.network.interceptor

import okhttp3.Interceptor
import okhttp3.Response

class UserAgentInterceptor(
    private val userAgentProvider: () -> String,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val customUa = userAgentProvider().trim()

        if (customUa.isNotEmpty()) {
            val newRequest =
                originalRequest
                    .newBuilder()
                    .header("User-Agent", customUa)
                    .build()
            return chain.proceed(newRequest)
        }

        if (originalRequest.header("User-Agent").isNullOrEmpty()) {
            val newRequest =
                originalRequest
                    .newBuilder()
                    .header("User-Agent", customUa)
                    .build()
            return chain.proceed(newRequest)
        }

        return chain.proceed(originalRequest)
    }
}
