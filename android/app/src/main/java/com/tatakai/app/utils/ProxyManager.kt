package com.tatakai.app.utils

object ProxyManager {
    private var supabaseUrl: String = ""
    private var apiKey: String = ""

    fun initialize(supabaseUrl: String, apiKey: String) {
        this.supabaseUrl = supabaseUrl
        this.apiKey = apiKey
    }

    fun getProxiedVideoUrl(
        videoUrl: String,
        referer: String? = null
    ): String {
        // Avoid double-proxying
        if (videoUrl.contains("/functions/v1/rapid-service")) {
            return videoUrl
        }

        // If proxy not configured, return direct URL
        if (supabaseUrl.isBlank() || apiKey.isBlank()) {
            return videoUrl
        }

        val params = mutableMapOf(
            "url" to videoUrl,
            "type" to "video",
            "apikey" to apiKey
        )
        referer?.let { params["referer"] = it }
        return "${supabaseUrl.trimEnd('/')}" + "/functions/v1/rapid-service?${params.toQueryString()}"
    }

    fun getProxiedImageUrl(imageUrl: String): String {
        val trimmed = imageUrl.trim()
        if (!trimmed.startsWith("http")) return trimmed
        if (trimmed.contains("/functions/v1/rapid-service")) return trimmed

        if (supabaseUrl.isBlank() || apiKey.isBlank()) {
            return trimmed
        }

        val params = mapOf(
            "url" to trimmed,
            "type" to "image",
            "apikey" to apiKey
        )
        return "${supabaseUrl.trimEnd('/')}" + "/functions/v1/rapid-service?${params.toQueryString()}"
    }

    fun getProxiedSubtitleUrl(subtitleUrl: String): String {
        if (supabaseUrl.isBlank() || apiKey.isBlank()) {
            return subtitleUrl
        }

        val params = mapOf(
            "url" to subtitleUrl,
            "type" to "subtitle",
            "apikey" to apiKey
        )
        return "${supabaseUrl.trimEnd('/')}" + "/functions/v1/rapid-service?${params.toQueryString()}"
    }

    fun buildProxyUrl(url: String, type: String, referer: String? = null): String {
        if (supabaseUrl.isBlank() || apiKey.isBlank()) {
            return url
        }

        val params = mutableMapOf(
            "url" to url,
            "type" to type,
            "apikey" to apiKey
        )
        referer?.let { params["referer"] = it }
        return "${supabaseUrl.trimEnd('/')}" + "/functions/v1/rapid-service?${params.toQueryString()}"
    }
}
