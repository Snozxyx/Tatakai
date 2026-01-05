package com.tatakai.app.data.remote

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONException
import org.json.JSONObject

class ResponseUnwrappingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (!response.isSuccessful) return response

        val body = response.peekBody(Long.MAX_VALUE).string()
        if (body.isBlank()) return response

        return try {
            val json = JSONObject(body)
            val unwrapped = when {
                json.has("success") && json.optBoolean("success") && json.has("data") -> {
                    json.get("data").toString()
                }

                json.has("status") && json.getInt("status") in 200..299 && json.has("data") -> {
                    json.get("data").toString()
                }

                else -> body
            }

            response.newBuilder()
                .body(unwrapped.toResponseBody("application/json".toMediaType()))
                .build()
        } catch (_: JSONException) {
            response
        }
    }
}
