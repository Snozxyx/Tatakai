package eu.kanade.tachiyomi.network

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class AndroidCookieJar : CookieJar {

    private val manager = runCatching { CookieManager.getInstance() }.getOrNull()
    private val memoryCookieJar = MemoryCookieJar()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val urlString = url.toString()
        cookies.forEach { cookie ->
            try {
                manager?.setCookie(urlString, cookie.toString())
            } catch (_: Exception) {}
        }
        memoryCookieJar.saveFromResponse(url, cookies)
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val webkitCookies = getFromManager(url)
        val memCookies = memoryCookieJar.loadForRequest(url)

        return (webkitCookies + memCookies).distinctBy { it.name }
    }

    fun get(url: HttpUrl): List<Cookie> {
        return loadForRequest(url)
    }

    private fun getFromManager(url: HttpUrl): List<Cookie> {
        val cookies = try {
            manager?.getCookie(url.toString())
        } catch (_: Exception) {
            null
        }
        return if (!cookies.isNullOrEmpty()) {
            cookies.split(";").mapNotNull { Cookie.parse(url, it.trim()) }
        } else {
            emptyList()
        }
    }

    fun addAll(url: HttpUrl, cookies: List<Cookie>) {
        val urlString = url.toString()
        cookies.forEach { cookie ->
            try {
                manager?.setCookie(urlString, cookie.toString())
            } catch (_: Exception) {}
            memoryCookieJar.addCookie(cookie)
        }
    }

    fun removeAll() {
        try {
            manager?.removeAllCookies(null)
        } catch (_: Exception) {}
        memoryCookieJar.clear()
    }
}
