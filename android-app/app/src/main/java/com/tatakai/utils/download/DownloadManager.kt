package com.tatakai.utils.download

import android.content.Context
import android.os.Environment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * Download manager for offline anime episode viewing
 * Supports background downloads, pause/resume, and progress tracking
 */
class DownloadManager(private val context: Context) {
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()
    
    private val downloadStates = ConcurrentHashMap<String, MutableStateFlow<DownloadState>>()
    private val activeDownloads = ConcurrentHashMap<String, Boolean>()
    
    data class DownloadInfo(
        val id: String,
        val animeId: String,
        val episodeId: String,
        val episodeNumber: Int,
        val animeTitle: String,
        val url: String,
        val quality: String
    )
    
    sealed class DownloadState {
        object Idle : DownloadState()
        data class Downloading(val progress: Float, val downloadedBytes: Long, val totalBytes: Long) : DownloadState()
        data class Completed(val filePath: String, val fileSize: Long) : DownloadState()
        data class Failed(val error: String) : DownloadState()
        object Paused : DownloadState()
    }
    
    fun getDownloadState(downloadId: String): StateFlow<DownloadState> {
        return downloadStates.getOrPut(downloadId) {
            MutableStateFlow(DownloadState.Idle)
        }
    }
    
    suspend fun startDownload(downloadInfo: DownloadInfo): Result<String> = withContext(Dispatchers.IO) {
        try {
            val downloadId = downloadInfo.id
            
            if (activeDownloads[downloadId] == true) {
                return@withContext Result.failure(Exception("Download already in progress"))
            }
            
            activeDownloads[downloadId] = true
            val stateFlow = downloadStates.getOrPut(downloadId) {
                MutableStateFlow(DownloadState.Idle)
            }
            
            val downloadsDir = File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "Tatakai/Anime"
            )
            downloadsDir.mkdirs()
            
            val fileName = "${downloadInfo.animeTitle.replace("[^a-zA-Z0-9]".toRegex(), "_")}_E${downloadInfo.episodeNumber}_${downloadInfo.quality}.mp4"
            val outputFile = File(downloadsDir, fileName)
            
            val request = Request.Builder()
                .url(downloadInfo.url)
                .build()
            
            val response = client.newCall(request).execute()
            
            if (!response.isSuccessful) {
                stateFlow.value = DownloadState.Failed("Download failed: ${response.code}")
                activeDownloads.remove(downloadId)
                return@withContext Result.failure(Exception("Download failed: ${response.code}"))
            }
            
            val totalBytes = response.body?.contentLength() ?: 0L
            var downloadedBytes = 0L
            
            response.body?.byteStream()?.use { input ->
                FileOutputStream(outputFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        if (activeDownloads[downloadId] != true) {
                            stateFlow.value = DownloadState.Paused
                            return@withContext Result.failure(Exception("Download paused"))
                        }
                        
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        
                        val progress = if (totalBytes > 0) {
                            downloadedBytes.toFloat() / totalBytes.toFloat()
                        } else {
                            0f
                        }
                        
                        stateFlow.value = DownloadState.Downloading(
                            progress = progress,
                            downloadedBytes = downloadedBytes,
                            totalBytes = totalBytes
                        )
                    }
                }
            }
            
            stateFlow.value = DownloadState.Completed(
                filePath = outputFile.absolutePath,
                fileSize = outputFile.length()
            )
            activeDownloads.remove(downloadId)
            
            Result.success(outputFile.absolutePath)
            
        } catch (e: Exception) {
            val stateFlow = downloadStates[downloadInfo.id]
            stateFlow?.value = DownloadState.Failed(e.message ?: "Unknown error")
            activeDownloads.remove(downloadInfo.id)
            Result.failure(e)
        }
    }
    
    fun pauseDownload(downloadId: String) {
        activeDownloads[downloadId] = false
        downloadStates[downloadId]?.value = DownloadState.Paused
    }
    
    fun cancelDownload(downloadId: String) {
        activeDownloads.remove(downloadId)
        downloadStates[downloadId]?.value = DownloadState.Idle
    }
    
    fun deleteDownload(filePath: String): Boolean {
        return try {
            val file = File(filePath)
            file.delete()
        } catch (e: Exception) {
            false
        }
    }
    
    fun getDownloadedSize(): Long {
        val downloadsDir = File(
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            "Tatakai/Anime"
        )
        return calculateDirectorySize(downloadsDir)
    }
    
    private fun calculateDirectorySize(directory: File): Long {
        var size = 0L
        if (directory.exists() && directory.isDirectory) {
            directory.listFiles()?.forEach { file ->
                size += if (file.isDirectory) {
                    calculateDirectorySize(file)
                } else {
                    file.length()
                }
            }
        }
        return size
    }
    
    fun clearAllDownloads(): Boolean {
        return try {
            val downloadsDir = File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "Tatakai/Anime"
            )
            downloadsDir.deleteRecursively()
            downloadStates.clear()
            activeDownloads.clear()
            true
        } catch (e: Exception) {
            false
        }
    }
}

fun Long.formatFileSize(): String {
    val kb = this / 1024.0
    val mb = kb / 1024.0
    val gb = mb / 1024.0
    
    return when {
        gb >= 1 -> String.format("%.2f GB", gb)
        mb >= 1 -> String.format("%.2f MB", mb)
        kb >= 1 -> String.format("%.2f KB", kb)
        else -> "$this B"
    }
}
