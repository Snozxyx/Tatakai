package com.tatakai.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tatakai.app.data.local.entities.WatchlistEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchlistDao {
    @Query("SELECT * FROM watchlist ORDER BY lastUpdated DESC")
    fun observeAll(): Flow<List<WatchlistEntity>>

    @Query("SELECT * FROM watchlist WHERE status = :status ORDER BY lastUpdated DESC")
    fun observeByStatus(status: String): Flow<List<WatchlistEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: WatchlistEntity)

    @Query("DELETE FROM watchlist WHERE animeId = :animeId")
    suspend fun delete(animeId: String)
}
