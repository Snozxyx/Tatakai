package com.tatakai.integrations.exoplayer

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Video player wrapper for ExoPlayer with HLS support
 * Manages playback state, progress tracking, and AniSkip integration
 */
@OptIn(UnstableApi::class)
class VideoPlayerManager(private val context: Context) {
    
    private var exoPlayer: ExoPlayer? = null
    
    private val _playbackState = MutableStateFlow<PlaybackState>(PlaybackState.Idle)
    val playbackState: StateFlow<PlaybackState> = _playbackState
    
    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition
    
    private val _duration = MutableStateFlow(0L)
    val duration: StateFlow<Long> = _duration
    
    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying
    
    private var skipIntro: Pair<Long, Long>? = null
    private var skipOutro: Pair<Long, Long>? = null
    
    fun initialize() {
        if (exoPlayer == null) {
            exoPlayer = ExoPlayer.Builder(context).build().apply {
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_IDLE -> _playbackState.value = PlaybackState.Idle
                            Player.STATE_BUFFERING -> _playbackState.value = PlaybackState.Buffering
                            Player.STATE_READY -> _playbackState.value = PlaybackState.Ready
                            Player.STATE_ENDED -> _playbackState.value = PlaybackState.Ended
                        }
                    }
                    
                    override fun onIsPlayingChanged(playing: Boolean) {
                        _isPlaying.value = playing
                    }
                })
                
                // Update position and duration periodically
                playWhenReady = false
            }
        }
    }
    
    fun loadVideo(url: String, isHls: Boolean = false) {
        val player = exoPlayer ?: return
        
        val mediaItem = MediaItem.fromUri(url)
        val dataSourceFactory = DefaultHttpDataSource.Factory()
        
        val mediaSource: MediaSource = if (isHls || url.contains(".m3u8")) {
            HlsMediaSource.Factory(dataSourceFactory)
                .createMediaSource(mediaItem)
        } else {
            ProgressiveMediaSource.Factory(dataSourceFactory)
                .createMediaSource(mediaItem)
        }
        
        player.setMediaSource(mediaSource)
        player.prepare()
    }
    
    fun play() {
        exoPlayer?.play()
    }
    
    fun pause() {
        exoPlayer?.pause()
    }
    
    fun seekTo(positionMs: Long) {
        exoPlayer?.seekTo(positionMs)
    }
    
    fun getCurrentPosition(): Long {
        return exoPlayer?.currentPosition ?: 0L
    }
    
    fun getDuration(): Long {
        return exoPlayer?.duration ?: 0L
    }
    
    fun setSkipIntro(start: Long, end: Long) {
        skipIntro = Pair(start, end)
    }
    
    fun setSkipOutro(start: Long, end: Long) {
        skipOutro = Pair(start, end)
    }
    
    fun checkAndSkipIntro(): Boolean {
        val intro = skipIntro ?: return false
        val position = getCurrentPosition()
        
        if (position >= intro.first && position <= intro.second) {
            seekTo(intro.second)
            return true
        }
        return false
    }
    
    fun checkAndSkipOutro(): Boolean {
        val outro = skipOutro ?: return false
        val position = getCurrentPosition()
        
        if (position >= outro.first && position <= outro.second) {
            seekTo(outro.second)
            return true
        }
        return false
    }
    
    fun getPlayer(): ExoPlayer? = exoPlayer
    
    fun release() {
        exoPlayer?.release()
        exoPlayer = null
    }
    
    fun setPlaybackSpeed(speed: Float) {
        exoPlayer?.setPlaybackSpeed(speed)
    }
}

sealed class PlaybackState {
    object Idle : PlaybackState()
    object Buffering : PlaybackState()
    object Ready : PlaybackState()
    object Ended : PlaybackState()
}
