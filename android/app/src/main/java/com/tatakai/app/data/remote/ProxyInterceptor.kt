package com.tatakai.app.data.remote

import com.tatakai.app.utils.toQueryString
import com.tatakai.app.utils.urlEncode
import okhttp3.Interceptor
import okhttp3.Response

class ProxyInterceptor(
    private val supabaseUrl: String,
    private val apiKey: String
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val originalUrl = originalRequest.url.toString()

        if (supabaseUrl.isBlank()) {
            return chain.proceed(originalRequest)
        }

        val referer = try {
            originalRequest.url.scheme + "://" + originalRequest.url.host
        } catch (_: Exception) {
            null
        }

        val params = mutableMapOf(
            "url" to originalUrl,
            "type" to "api",
            "apikey" to apiKey
        )
        referer?.let { params["referer"] = it }

        val proxiedUrl = "${supabaseUrl.trimEnd('/')}/functions/v1/rapid-service?${params.toQueryString()}"

        fun proceedWithBackoff(url: String, isSupabase: Boolean): Response {
            var lastException: Exception? = null
            val delays = listOf(300L, 600L, 1200L)
            for (attempt in 0 until 3) {
                try {
                    val reqBuilder = originalRequest.newBuilder().url(url)
                    if (isSupabase) {
                        reqBuilder
                            .header("apikey", apiKey)
                            .header("Authorization", "Bearer $apiKey")
                            .header("Content-Type", "application/json")
                    }
                    val response = chain.proceed(reqBuilder.build())

                    // Only retry transient errors
                    if (response.isSuccessful) return response
                    if (response.code in 500..599 || response.code == 408 || response.code == 429) {
                        response.close()
                        Thread.sleep(delays.getOrElse(attempt) { 1200L })
                        continue
                    }

                    return response
                } catch (e: Exception) {
                    lastException = e
                    Thread.sleep(delays.getOrElse(attempt) { 1200L })
                }
            }
            throw lastException ?: RuntimeException("Network request failed")
        }

        return try {
            proceedWithBackoff(proxiedUrl, isSupabase = true)
        } catch (_: Exception) {
            val fallbackUrl = "https://api.allorigins.win/raw?url=${originalUrl.urlEncode()}"
            proceedWithBackoff(fallbackUrl, isSupabase = false)
        }
    }
}
