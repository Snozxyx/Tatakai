package com.tatakai.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.tatakai.app.data.local.dao.DownloadDao
import com.tatakai.app.data.local.dao.WatchHistoryDao
import com.tatakai.app.data.local.dao.WatchlistDao
import com.tatakai.app.data.local.entities.DownloadEntity
import com.tatakai.app.data.local.entities.WatchHistoryEntity
import com.tatakai.app.data.local.entities.WatchlistEntity

@Database(
    entities = [
        WatchlistEntity::class,
        WatchHistoryEntity::class,
        DownloadEntity::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun watchlistDao(): WatchlistDao
    abstract fun watchHistoryDao(): WatchHistoryDao
    abstract fun downloadDao(): DownloadDao
}
