package com.tatakai.app.ui.screens.player

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PlayerScreen(
    episodeId: String,
    server: String,
    category: String,
    onBack: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Button(onClick = onBack) { Text("Back") }
        Text(text = "Player", style = MaterialTheme.typography.headlineMedium)
        Text(text = "Episode: $episodeId", style = MaterialTheme.typography.bodyMedium)
        Text(text = "Server: $server | Category: $category", style = MaterialTheme.typography.bodyMedium)
        Text(
            text = "This screen should use ExoPlayer (Media3) to play proxied HLS/DASH streams and load subtitles.",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
