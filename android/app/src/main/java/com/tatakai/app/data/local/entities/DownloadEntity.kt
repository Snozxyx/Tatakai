package com.tatakai.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String, // "$animeId:$episodeNumber"
    val animeId: String,
    val animeName: String,
    val episodeNumber: Int,
    val episodeId: String,
    val quality: String, // "1080p", "720p", "480p", "HEVC 10-bit 1080p"
    val subtitleLanguage: String?,
    val status: String, // "queued", "downloading", "completed", "failed", "paused"
    val progress: Int, // 0-100
    val filePath: String?,
    val fileSize: Long, // bytes
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)
