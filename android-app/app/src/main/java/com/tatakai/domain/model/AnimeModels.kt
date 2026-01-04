package com.tatakai.domain.model

import com.google.gson.annotations.SerializedName

/**
 * Core anime data models matching the web app structure
 */

data class Anime(
    val id: String,
    val title: String,
    val image: String?,
    val cover: String?,
    val description: String?,
    val releaseDate: String?,
    val genres: List<String>?,
    val status: String?,
    val rating: Double?,
    val totalEpisodes: Int?,
    val type: String?,
    val otherName: String?,
    val episodes: List<Episode>? = null
)

data class Episode(
    val id: String,
    val number: Int,
    val title: String?,
    val image: String?,
    val description: String?,
    val isFiller: Boolean = false
)

data class VideoSource(
    val url: String,
    val quality: String,
    val isM3U8: Boolean = false
)

data class StreamingData(
    val sources: List<VideoSource>,
    val subtitles: List<Subtitle>? = null,
    val intro: TimeRange? = null,
    val outro: TimeRange? = null,
    val download: String? = null
)

data class Subtitle(
    val url: String,
    val lang: String
)

data class TimeRange(
    val start: Double,
    val end: Double
)

data class AnimeSearchResult(
    val currentPage: Int,
    val hasNextPage: Boolean,
    val results: List<Anime>
)

data class Genre(
    val id: String,
    val name: String
)

data class WatchHistoryItem(
    val id: String,
    val animeId: String,
    val episodeId: String,
    val episodeNumber: Int,
    val progress: Double,
    val timestamp: Long,
    val animeTitle: String?,
    val animeImage: String?
)

data class WatchlistItem(
    val id: String,
    val animeId: String,
    val addedAt: Long,
    val anime: Anime?
)

data class DownloadedEpisode(
    val id: String,
    val animeId: String,
    val episodeId: String,
    val episodeNumber: Int,
    val animeTitle: String,
    val animeImage: String?,
    val filePath: String,
    val quality: String,
    val fileSize: Long,
    val downloadedAt: Long
)

data class UserProfile(
    val id: String,
    val email: String,
    val username: String?,
    val avatar: String?,
    val theme: String = "midnight",
    val createdAt: Long
)

data class Comment(
    val id: String,
    val userId: String,
    val animeId: String,
    val content: String,
    val rating: Int?,
    val createdAt: Long,
    val username: String?,
    val avatar: String?
)
