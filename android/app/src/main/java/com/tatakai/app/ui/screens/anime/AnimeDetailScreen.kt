package com.tatakai.app.ui.screens.anime

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun AnimeDetailScreen(
    animeId: String,
    onBack: () -> Unit,
    onPlayEpisode: (episodeId: String, server: String, category: String) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row {
            Button(onClick = onBack) { Text("Back") }
        }
        Text(text = "Anime Detail", style = MaterialTheme.typography.headlineMedium)
        Text(text = "Anime ID: $animeId", style = MaterialTheme.typography.bodyMedium)
        Text(
            text = "This screen should show anime metadata, episodes list, related, recommendations, comments, and actions.",
            style = MaterialTheme.typography.bodyMedium
        )

        Button(onClick = { onPlayEpisode("$animeId?ep=1", "hd-1", "sub") }) {
            Text("Play Episode 1")
        }
    }
}
