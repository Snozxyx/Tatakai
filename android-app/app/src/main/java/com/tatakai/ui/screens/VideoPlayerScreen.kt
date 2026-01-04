package com.tatakai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.ui.PlayerView
import androidx.navigation.NavController
import com.tatakai.integrations.exoplayer.VideoPlayerManager
import com.tatakai.utils.haptic.rememberHapticFeedback

@Composable
fun VideoPlayerScreen(
    navController: NavController,
    animeId: String,
    episodeId: String
) {
    val context = LocalContext.current
    val haptic = rememberHapticFeedback()
    val playerManager = remember { VideoPlayerManager(context) }
    var isPlaying by remember { mutableStateOf(false) }
    var showControls by remember { mutableStateOf(true) }
    
    LaunchedEffect(Unit) {
        playerManager.initialize()
        // Load video URL here
        // playerManager.loadVideo(videoUrl, isHls = true)
    }
    
    DisposableEffect(Unit) {
        onDispose {
            playerManager.release()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // ExoPlayer View
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = playerManager.getPlayer()
                    useController = false
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        
        // Custom Controls Overlay
        if (showControls) {
            VideoPlayerControls(
                isPlaying = isPlaying,
                onPlayPause = {
                    haptic.medium()
                    if (isPlaying) {
                        playerManager.pause()
                    } else {
                        playerManager.play()
                    }
                    isPlaying = !isPlaying
                },
                onBack = {
                    haptic.light()
                    navController.popBackStack()
                },
                onSettings = {
                    haptic.medium()
                    // Show quality selector
                },
                onSkipIntro = {
                    haptic.medium()
                    playerManager.checkAndSkipIntro()
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoPlayerControls(
    isPlaying: Boolean,
    onPlayPause: () -> Unit,
    onBack: () -> Unit,
    onSettings: () -> Unit,
    onSkipIntro: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Top bar
        TopAppBar(
            title = { Text("Episode 1") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }
            },
            actions = {
                IconButton(onClick = onSettings) {
                    Icon(
                        Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = Color.White
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color.Black.copy(alpha = 0.5f),
                titleContentColor = Color.White
            )
        )
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Center play/pause button
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            IconButton(
                onClick = onPlayPause,
                modifier = Modifier.size(80.dp)
            ) {
                Icon(
                    if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                    contentDescription = if (isPlaying) "Pause" else "Play",
                    tint = Color.White,
                    modifier = Modifier.size(64.dp)
                )
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        // Bottom controls
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.5f))
                .padding(16.dp)
        ) {
            // Progress bar
            LinearProgressIndicator(
                progress = 0.3f,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = Color.White.copy(alpha = 0.3f)
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "5:30",
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall
                )
                
                Button(
                    onClick = onSkipIntro,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Text("Skip Intro")
                }
                
                Text(
                    "24:00",
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}
