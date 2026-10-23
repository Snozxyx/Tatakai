@file:Suppress("ktlint:standard:property-naming", "PropertyName")

package eu.kanade.tachiyomi.animesource.model

import kotlinx.serialization.json.JsonObject
import java.io.Serializable

interface SAnime : Serializable {
    var url: String

    var title: String

    var thumbnail_url: String?

    var background_url: String?

    var artist: String?

    var author: String?

    var status: Int

    var description: String?

    var genre: String?

    var update_strategy: AnimeUpdateStrategy

    var fetch_type: FetchType

    var season_number: Double

    var initialized: Boolean

    var memo: JsonObject

    fun getGenres(): List<String>? {
        if (genre.isNullOrBlank()) return null
        return genre?.split(", ")?.map { it.trim() }?.filterNot { it.isBlank() }?.distinct()
    }

    fun copyFrom(other: SAnime) {
        title = other.title

        if (other.author != null) {
            author = other.author
        }

        if (other.artist != null) {
            artist = other.artist
        }

        if (other.description != null) {
            description = other.description
        }

        if (other.genre != null) {
            genre = other.genre
        }

        if (other.thumbnail_url != null) {
            thumbnail_url = other.thumbnail_url
        }

        if (other.background_url != null) {
            background_url = other.background_url
        }

        status = other.status
        update_strategy = other.update_strategy
        fetch_type = other.fetch_type
        season_number = other.season_number
        memo = other.memo

        if (!initialized) {
            initialized = other.initialized
        }
    }

    fun copy(): SAnime =
        create().also {
            it.url = url
            it.title = title
            it.artist = artist
            it.author = author
            it.description = description
            it.genre = genre
            it.status = status
            it.thumbnail_url = thumbnail_url
            it.background_url = background_url
            it.update_strategy = update_strategy
            it.fetch_type = fetch_type
            it.season_number = season_number
            it.initialized = initialized
            it.memo = memo
        }

    companion object {
        const val UNKNOWN = 0
        const val ONGOING = 1
        const val COMPLETED = 2
        const val LICENSED = 3
        const val PUBLISHING_FINISHED = 4
        const val CANCELLED = 5
        const val ON_HIATUS = 6
        const val UPCOMING = 7

        fun create(): SAnime = SAnimeImpl()
    }
}
