package com.tatakai.app.utils.player

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import com.tatakai.app.data.models.StreamingData
import com.tatakai.app.utils.ProxyManager
import okhttp3.OkHttpClient

@UnstableApi
class ExoPlayerManager(context: Context) {

    val player: ExoPlayer = ExoPlayer.Builder(context).build()

    private val okHttpClient = OkHttpClient.Builder().build()

    fun playStreamingSource(
        streamingData: StreamingData,
        sourceIndex: Int = 0,
        onError: (Exception) -> Unit = {}
    ) {
        try {
            val source = streamingData.sources.getOrNull(sourceIndex)
                ?: throw Exception("No streaming sources available")

            val headers = streamingData.headers
            val referer = headers["Referer"] ?: ""
            val proxiedUrl = ProxyManager.getProxiedVideoUrl(source.url, referer)

            val subtitles = streamingData.getAllSubtitles().map { subtitle ->
                val proxiedSubUrl = ProxyManager.getProxiedSubtitleUrl(subtitle.url)
                val mimeType = when {
                    proxiedSubUrl.endsWith(".vtt", ignoreCase = true) -> MimeTypes.TEXT_VTT
                    proxiedSubUrl.endsWith(".srt", ignoreCase = true) -> MimeTypes.APPLICATION_SUBRIP
                    proxiedSubUrl.endsWith(".ass", ignoreCase = true) -> MimeTypes.TEXT_SSA
                    else -> MimeTypes.TEXT_VTT
                }

                MediaItem.SubtitleConfiguration.Builder(Uri.parse(proxiedSubUrl))
                    .setMimeType(mimeType)
                    .setLanguage(subtitle.lang)
                    .setLabel(subtitle.label ?: subtitle.lang)
                    .build()
            }

            val mediaItem = MediaItem.Builder()
                .setUri(Uri.parse(proxiedUrl))
                .setSubtitleConfigurations(subtitles)
                .build()

            val headersMap = headers.mapValues { it.value }
            val dataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
                .setDefaultRequestProperties(headersMap)

            val mediaSource: MediaSource = if (source.isM3U8) {
                HlsMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(mediaItem)
            } else {
                DashMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(mediaItem)
            }

            player.setMediaSource(mediaSource)
            player.prepare()
            player.playWhenReady = true

        } catch (e: Exception) {
            onError(e)
        }
    }

    fun release() {
        player.release()
    }
}
