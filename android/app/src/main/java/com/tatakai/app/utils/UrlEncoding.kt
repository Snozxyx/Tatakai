package com.tatakai.app.utils

import java.net.URLEncoder

fun String.urlEncode(): String = URLEncoder.encode(this, "UTF-8")

fun Map<String, String>.toQueryString(): String {
    return entries.joinToString("&") { (k, v) -> "${k.urlEncode()}=${v.urlEncode()}" }
}
