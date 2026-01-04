package com.tatakai.integrations.consumet

import com.tatakai.domain.model.*
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Consumet API interface for anime data
 * Documentation: https://docs.consumet.org/
 */
interface ConsumetApi {
    
    @GET("anime/gogoanime/{query}")
    suspend fun searchAnime(
        @Path("query") query: String,
        @Query("page") page: Int = 1
    ): Response<AnimeSearchResult>
    
    @GET("anime/gogoanime/info/{id}")
    suspend fun getAnimeInfo(
        @Path("id") animeId: String
    ): Response<Anime>
    
    @GET("anime/gogoanime/watch/{episodeId}")
    suspend fun getStreamingLinks(
        @Path("episodeId") episodeId: String
    ): Response<StreamingData>
    
    @GET("anime/gogoanime/recent-episodes")
    suspend fun getRecentEpisodes(
        @Query("page") page: Int = 1,
        @Query("type") type: Int = 1
    ): Response<AnimeSearchResult>
    
    @GET("anime/gogoanime/top-airing")
    suspend fun getTopAiring(
        @Query("page") page: Int = 1
    ): Response<AnimeSearchResult>
    
    @GET("anime/gogoanime/popular")
    suspend fun getPopular(
        @Query("page") page: Int = 1
    ): Response<AnimeSearchResult>
    
    @GET("anime/gogoanime/genre/{genre}")
    suspend fun getAnimeByGenre(
        @Path("genre") genre: String,
        @Query("page") page: Int = 1
    ): Response<AnimeSearchResult>
}
