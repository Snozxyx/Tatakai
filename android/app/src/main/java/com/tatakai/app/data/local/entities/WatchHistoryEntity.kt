package com.tatakai.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "watch_history")
data class WatchHistoryEntity(
    @PrimaryKey val id: String, // "$userId:$animeId:$episodeNumber" or guest-based
    val userId: String?,
    val animeId: String,
    val episodeNumber: Int,
    val episodeId: String,
    val watchedUntilMs: Long,
    val updatedAt: Long = System.currentTimeMillis()
)
