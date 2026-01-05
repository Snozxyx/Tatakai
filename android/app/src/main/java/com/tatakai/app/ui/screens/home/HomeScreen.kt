package com.tatakai.app.ui.screens.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(
    onSearchClick: () -> Unit,
    onAnimeClick: (String) -> Unit,
    onProfileClick: () -> Unit,
    onWatchlistClick: () -> Unit,
    onDownloadsClick: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(text = "Home", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.width(8.dp))
        Row {
            Button(onClick = onSearchClick) { Text("Search") }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onWatchlistClick) { Text("Watchlist") }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onDownloadsClick) { Text("Downloads") }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onProfileClick) { Text("Profile") }
        }

        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "UI + data loading for Spotlight/Trending/Latest/Top 10 sections should be rendered here (Compose).",
            style = MaterialTheme.typography.bodyMedium
        )

        Spacer(modifier = Modifier.width(8.dp))
        Button(onClick = { onAnimeClick("naruto-shippuden") }) { Text("Open sample anime") }
    }
}
