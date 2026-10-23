@file:Suppress("ktlint:standard:property-naming", "PropertyName")

package eu.kanade.tachiyomi.animesource.model

import kotlinx.serialization.json.JsonObject
import java.io.Serializable

interface SEpisode : Serializable {
    var url: String

    var name: String

    var date_upload: Long

    var episode_number: Float

    var scanlator: String?

    var fillermark: Boolean

    var summary: String?

    var preview_url: String?

    var memo: JsonObject

    fun copyFrom(other: SEpisode) {
        name = other.name
        url = other.url
        date_upload = other.date_upload
        episode_number = other.episode_number
        scanlator = other.scanlator
        fillermark = other.fillermark
        summary = other.summary
        preview_url = other.preview_url
        memo = other.memo
    }

    companion object {
        fun create(): SEpisode = SEpisodeImpl()
    }
}
