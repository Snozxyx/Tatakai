package com.tatakai.app.data.models

import com.google.gson.annotations.SerializedName

data class Episode(
    @SerializedName("sub") val sub: Int = 0,
    @SerializedName("dub") val dub: Int = 0
)

data class AnimeCard(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("jname") val jname: String? = null,
    @SerializedName("poster") val poster: String,
    @SerializedName("type") val type: String? = null,
    @SerializedName("duration") val duration: String? = null,
    @SerializedName("rating") val rating: String? = null,
    @SerializedName("episodes") val episodes: Episode
)

data class SpotlightAnime(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("jname") val jname: String,
    @SerializedName("poster") val poster: String,
    @SerializedName("description") val description: String,
    @SerializedName("rank") val rank: Int,
    @SerializedName("otherInfo") val otherInfo: List<String>,
    @SerializedName("episodes") val episodes: Episode
)

data class TrendingAnime(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("poster") val poster: String,
    @SerializedName("rank") val rank: Int
)

data class TopAnime(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("poster") val poster: String,
    @SerializedName("rank") val rank: Int,
    @SerializedName("episodes") val episodes: Episode
)

data class Top10Animes(
    @SerializedName("today") val today: List<TopAnime>,
    @SerializedName("week") val week: List<TopAnime>,
    @SerializedName("month") val month: List<TopAnime>
)

data class HomeData(
    @SerializedName("genres") val genres: List<String>,
    @SerializedName("latestEpisodeAnimes") val latestEpisodeAnimes: List<AnimeCard>,
    @SerializedName("spotlightAnimes") val spotlightAnimes: List<SpotlightAnime>,
    @SerializedName("top10Animes") val top10Animes: Top10Animes,
    @SerializedName("topAiringAnimes") val topAiringAnimes: List<AnimeCard>,
    @SerializedName("topUpcomingAnimes") val topUpcomingAnimes: List<AnimeCard>,
    @SerializedName("trendingAnimes") val trendingAnimes: List<TrendingAnime>,
    @SerializedName("mostPopularAnimes") val mostPopularAnimes: List<AnimeCard>,
    @SerializedName("mostFavoriteAnimes") val mostFavoriteAnimes: List<AnimeCard>,
    @SerializedName("latestCompletedAnimes") val latestCompletedAnimes: List<AnimeCard>
)

data class AnimeStats(
    @SerializedName("rating") val rating: String,
    @SerializedName("quality") val quality: String,
    @SerializedName("episodes") val episodes: Episode,
    @SerializedName("type") val type: String,
    @SerializedName("duration") val duration: String
)

data class PromoVideo(
    @SerializedName("title") val title: String? = null,
    @SerializedName("source") val source: String? = null,
    @SerializedName("thumbnail") val thumbnail: String? = null
)

data class Character(
    @SerializedName("id") val id: String,
    @SerializedName("poster") val poster: String,
    @SerializedName("name") val name: String,
    @SerializedName("cast") val cast: String
)

data class CharacterPairing(
    @SerializedName("character") val character: Character,
    @SerializedName("voiceActor") val voiceActor: Character
)

data class AnimeMetadata(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("poster") val poster: String,
    @SerializedName("description") val description: String,
    @SerializedName("stats") val stats: AnimeStats,
    @SerializedName("promotionalVideos") val promotionalVideos: List<PromoVideo>,
    @SerializedName("characterVoiceActor") val characterVoiceActor: List<CharacterPairing>
)

data class AnimeInfo(
    @SerializedName("info") val info: AnimeMetadata,
    @SerializedName("moreInfo") val moreInfo: Map<String, Any>
)

data class AnimeInfoResponse(
    @SerializedName("anime") val anime: AnimeInfo,
    @SerializedName("recommendedAnimes") val recommendedAnimes: List<AnimeCard>,
    @SerializedName("relatedAnimes") val relatedAnimes: List<AnimeCard>
)

data class EpisodeData(
    @SerializedName("number") val number: Int,
    @SerializedName("title") val title: String,
    @SerializedName("episodeId") val episodeId: String,
    @SerializedName("isFiller") val isFiller: Boolean
)

data class EpisodeListResponse(
    @SerializedName("totalEpisodes") val totalEpisodes: Int,
    @SerializedName("episodes") val episodes: List<EpisodeData>
)

data class EpisodeServer(
    @SerializedName("serverId") val serverId: Int,
    @SerializedName("serverName") val serverName: String
)

data class ServerList(
    @SerializedName("episodeId") val episodeId: String,
    @SerializedName("episodeNo") val episodeNo: Int,
    @SerializedName("sub") val sub: List<EpisodeServer>,
    @SerializedName("dub") val dub: List<EpisodeServer>,
    @SerializedName("raw") val raw: List<EpisodeServer>
)

data class StreamingSource(
    @SerializedName("url") val url: String,
    @SerializedName("isM3U8") val isM3U8: Boolean,
    @SerializedName("quality") val quality: String? = null,
    @SerializedName("language") val language: String? = null,
    @SerializedName("langCode") val langCode: String? = null,
    @SerializedName("isDub") val isDub: Boolean? = null,
    @SerializedName("providerName") val providerName: String? = null,
    @SerializedName("needsHeadless") val needsHeadless: Boolean? = null,
    @SerializedName("isEmbed") val isEmbed: Boolean? = null
)

data class Subtitle(
    @SerializedName("lang") val lang: String,
    @SerializedName("url") val url: String,
    @SerializedName("label") val label: String? = null
)

data class SkipSegment(
    @SerializedName("start") val start: Int,
    @SerializedName("end") val end: Int
)

data class StreamingData(
    @SerializedName("headers") val headers: Map<String, String>,
    @SerializedName("sources") val sources: List<StreamingSource>,
    @SerializedName("subtitles") val subtitles: List<Subtitle> = emptyList(),
    @SerializedName("tracks") val tracks: List<Subtitle>? = null,
    @SerializedName("anilistID") val anilistID: Int? = null,
    @SerializedName("malID") val malID: Int? = null,
    @SerializedName("intro") val intro: SkipSegment? = null,
    @SerializedName("outro") val outro: SkipSegment? = null
) {
    fun getAllSubtitles(): List<Subtitle> = subtitles.ifEmpty { tracks ?: emptyList() }
}

data class SearchResult(
    @SerializedName("animes") val animes: List<AnimeCard>,
    @SerializedName("mostPopularAnimes") val mostPopularAnimes: List<AnimeCard>,
    @SerializedName("currentPage") val currentPage: Int,
    @SerializedName("totalPages") val totalPages: Int,
    @SerializedName("hasNextPage") val hasNextPage: Boolean,
    @SerializedName("searchQuery") val searchQuery: String
)

data class GenreResult(
    @SerializedName("genreName") val genreName: String,
    @SerializedName("animes") val animes: List<AnimeCard>,
    @SerializedName("currentPage") val currentPage: Int,
    @SerializedName("totalPages") val totalPages: Int,
    @SerializedName("hasNextPage") val hasNextPage: Boolean
)
