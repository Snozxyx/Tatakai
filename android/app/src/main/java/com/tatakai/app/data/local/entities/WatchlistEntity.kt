package com.tatakai.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "watchlist")
data class WatchlistEntity(
    @PrimaryKey val animeId: String,
    val name: String,
    val poster: String,
    val status: String, // "watching", "completed", "plan_to_watch", "dropped", "favorites"
    val lastUpdated: Long = System.currentTimeMillis()
)
