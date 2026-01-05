package com.tatakai.app.data.remote

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.reflect.TypeToken
import com.tatakai.app.data.models.AnimeInfoResponse
import com.tatakai.app.data.models.EpisodeListResponse
import com.tatakai.app.data.models.GenreResult
import com.tatakai.app.data.models.HomeData
import com.tatakai.app.data.models.SearchResult
import com.tatakai.app.data.models.ServerList
import com.tatakai.app.data.models.StreamingData
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

class HiAnimeClient(
    supabaseUrl: String,
    supabaseApiKey: String,
    private val gson: Gson = Gson()
) {
    private val apiBaseUrl = "https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime/"

    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(ProxyInterceptor(supabaseUrl, supabaseApiKey))
        .addInterceptor(ResponseUnwrappingInterceptor())
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(apiBaseUrl)
        .client(httpClient)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()

    private val api: HiAnimeApi = retrofit.create(HiAnimeApi::class.java)

    private interface HiAnimeApi {
        @GET("home")
        suspend fun getHome(): JsonElement

        @GET("anime/{animeId}")
        suspend fun getAnimeInfo(@Path("animeId") animeId: String): JsonElement

        @GET("anime/{animeId}/episodes")
        suspend fun getEpisodes(@Path("animeId") animeId: String): JsonElement

        @GET("episode/servers")
        suspend fun getEpisodeServers(
            @Query("animeEpisodeId") episodeId: String
        ): JsonElement

        @GET("episode/sources")
        suspend fun getStreamingSources(
            @Query("animeEpisodeId") episodeId: String,
            @Query("server") server: String,
            @Query("category") category: String
        ): JsonElement

        @GET("search")
        suspend fun search(
            @Query("q") query: String,
            @Query("page") page: Int
        ): JsonElement

        @GET("genre/{genre}")
        suspend fun getGenreAnimes(
            @Path("genre") genre: String,
            @Query("page") page: Int
        ): JsonElement
    }

    suspend fun fetchHome(): HomeData = parseData(api.getHome())

    suspend fun fetchAnimeInfo(animeId: String): AnimeInfoResponse = parseData(api.getAnimeInfo(animeId))

    suspend fun fetchEpisodes(animeId: String): EpisodeListResponse = parseData(api.getEpisodes(animeId))

    suspend fun fetchEpisodeServers(episodeId: String): ServerList = parseData(api.getEpisodeServers(episodeId))

    suspend fun fetchStreamingSources(
        episodeId: String,
        server: String = "hd-1",
        category: String = "sub"
    ): StreamingData = parseData(api.getStreamingSources(episodeId, server, category))

    suspend fun searchAnime(query: String, page: Int = 1): SearchResult = parseData(api.search(query, page))

    suspend fun fetchGenreAnimes(genre: String, page: Int = 1): GenreResult = parseData(api.getGenreAnimes(genre, page))

    private inline fun <reified T> parseData(payload: JsonElement): T {
        val element: JsonElement = if (payload.isJsonObject) {
            val obj = payload.asJsonObject
            when {
                obj.has("success") && obj.get("success").asBoolean && obj.has("data") -> obj.get("data")
                obj.has("status") && obj.get("status").asInt in 200..299 && obj.has("data") -> obj.get("data")
                else -> payload
            }
        } else {
            payload
        }

        val type = object : TypeToken<T>() {}.type
        return gson.fromJson(element, type)
    }
}
